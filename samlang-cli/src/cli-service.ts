import { spawnSync } from 'child_process';
import {
  lstatSync,
  readdirSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  unlinkSync,
} from 'fs';
import { join, normalize, dirname, resolve, relative, sep } from 'path';

import {
  compileSamlangSourcesToHighIRSources,
  lowerHighIRSourcesToMidIRSources,
  lowerMidIRSourcesToLLVMSources,
} from 'samlang-core-compiler';
import {
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_THROW,
  ENCODED_FUNCTION_NAME_FREE,
  encodeMainFunctionName,
} from 'samlang-core/ast/common-names';
import { ModuleReference, Sources } from 'samlang-core/ast/common-nodes';
import { prettyPrintLLVMSources } from 'samlang-core/ast/llvm-nodes';
import { MidIRSources, prettyPrintMidIRSourcesAsTSSources } from 'samlang-core/ast/mir-nodes';
import type { SamlangModule } from 'samlang-core/ast/samlang-nodes';
import { optimizeHighIRSourcesAccordingToConfiguration } from 'samlang-core/optimization';

import type { SamlangProjectConfiguration } from './configuration';

function walk(startPath: string, visitor: (file: string) => void): void {
  function recursiveVisit(path: string): void {
    if (lstatSync(path).isFile()) {
      visitor(path);
      return;
    }

    if (lstatSync(path).isDirectory()) {
      readdirSync(path).some((relativeChildPath) => recursiveVisit(join(path, relativeChildPath)));
    }
  }

  return recursiveVisit(startPath);
}

export function collectSources({
  sourceDirectory,
}: SamlangProjectConfiguration): readonly (readonly [ModuleReference, string])[] {
  const sourcePath = resolve(sourceDirectory);
  const sources: (readonly [ModuleReference, string])[] = [];

  walk(sourcePath, (file) => {
    if (!file.endsWith('.sam')) return;
    const relativeFile = normalize(relative(sourcePath, file));
    const relativeFileWithoutExtension = relativeFile.substring(0, relativeFile.length - 4);
    sources.push([
      new ModuleReference(relativeFileWithoutExtension.split(sep)),
      readFileSync(file).toString(),
    ]);
  });

  return sources;
}

function compileToTS(
  midIRSources: MidIRSources,
  moduleReferences: readonly ModuleReference[],
  outputDirectory: string
): void {
  mkdirSync(outputDirectory, { recursive: true });
  const commonJSCode = `type Str = [number, string];
const ${ENCODED_FUNCTION_NAME_STRING_CONCAT} = ([, a]: Str, [, b]: Str): Str => [1, a + b];
const ${ENCODED_FUNCTION_NAME_PRINTLN} = ([, line]: Str): number => { console.log(line); return 0; }
const ${ENCODED_FUNCTION_NAME_STRING_TO_INT} = ([, v]: Str): number => parseInt(v, 10);
const ${ENCODED_FUNCTION_NAME_INT_TO_STRING} = (v: number): Str => [1, String(v)];
const ${ENCODED_FUNCTION_NAME_THROW} = ([, v]: Str): number => { throw Error(v); };
const ${ENCODED_FUNCTION_NAME_FREE} = (v: unknown): number => 0;
${prettyPrintMidIRSourcesAsTSSources(midIRSources)}`;
  const mainFunctions = new Set(midIRSources.mainFunctionNames);
  moduleReferences.forEach((moduleReference) => {
    const mainFunctionName = encodeMainFunctionName(moduleReference);
    if (!mainFunctions.has(mainFunctionName)) return;
    const outputJSFilePath = join(outputDirectory, `${moduleReference}.ts`);
    writeFileSync(outputJSFilePath, `${commonJSCode}\n${mainFunctionName}();\n`);
  });
}

function compileToLLVMSources(
  midIRSources: MidIRSources,
  moduleReferences: readonly ModuleReference[],
  outputDirectory: string
): readonly string[] {
  const paths: string[] = [];
  const llvmSources = lowerMidIRSourcesToLLVMSources(midIRSources);

  const outputLLVMExportingFilePath = join(outputDirectory, `_all_.ll`);
  mkdirSync(dirname(outputLLVMExportingFilePath), { recursive: true });
  const commonLLVMCode = prettyPrintLLVMSources(llvmSources);

  const mainFunctions = new Set(llvmSources.mainFunctionNames);
  moduleReferences.forEach((moduleReference) => {
    const mainFunctionName = encodeMainFunctionName(moduleReference);
    if (!mainFunctions.has(mainFunctionName)) return;
    const outputLLVMFilePath = join(outputDirectory, `${moduleReference}.ll`);
    mkdirSync(dirname(outputLLVMFilePath), { recursive: true });
    writeFileSync(
      outputLLVMFilePath,
      `${commonLLVMCode}
define i64 @_compiled_program_main() local_unnamed_addr nounwind {
  call i64 @${mainFunctionName}() nounwind
  ret i64 0
}
`
    );
    paths.push(outputLLVMFilePath);
  });
  return paths;
}

const RUNTIME_PATH = join(__dirname, '..', 'samlang-runtime');
const LLVM_LIBRARY_PATH = join(RUNTIME_PATH, `libsam-${process.platform}.bc`);

const shellOut = (program: string, ...programArguments: readonly string[]): boolean =>
  spawnSync(program, programArguments, { shell: true, stdio: 'inherit' }).status === 0;

function unlinkIfExist(file: string): void {
  if (existsSync(file)) unlinkSync(file);
}

export function compileEverything(
  sources: Sources<SamlangModule>,
  outputDirectory: string
): boolean {
  const midIRSources = lowerHighIRSourcesToMidIRSources(
    optimizeHighIRSourcesAccordingToConfiguration(compileSamlangSourcesToHighIRSources(sources))
  );
  const moduleReferences = sources.entries().map(([moduleReference]) => moduleReference);

  compileToTS(midIRSources, moduleReferences, outputDirectory);

  if (spawnSync('llc', ['--help'], { shell: true, stdio: 'pipe' }).status !== 0) {
    // eslint-disable-next-line no-console
    console.error('You do not have LLVM toolchain installation. Skipping LLVM targets.');
    return true;
  }

  const assembleResults = compileToLLVMSources(midIRSources, moduleReferences, outputDirectory).map(
    (modulePath) => {
      const outputProgramPath = modulePath.substring(0, modulePath.length - 3);
      const bitcodePath = `${outputProgramPath}.bc`;
      const success =
        shellOut('llvm-link', '-o', bitcodePath, modulePath, LLVM_LIBRARY_PATH) &&
        shellOut('llc', '-O2', '-filetype=obj', '--relocation-model=pic', bitcodePath) &&
        shellOut('gcc', '-o', outputProgramPath, `${outputProgramPath}.o`);
      unlinkIfExist(`${outputProgramPath}.o`);
      return success;
    }
  );
  return assembleResults.every((it) => it);
}
