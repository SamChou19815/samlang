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

import { encodeMainFunctionName } from '@dev-sam/samlang-core/ast/common-names';
import { ModuleReference, Sources } from '@dev-sam/samlang-core/ast/common-nodes';
import { prettyPrintLLVMSources } from '@dev-sam/samlang-core/ast/llvm-nodes';
import {
  MidIRSources,
  prettyPrintMidIRSourcesAsTSSources,
} from '@dev-sam/samlang-core/ast/mir-nodes';
import type { SamlangModule } from '@dev-sam/samlang-core/ast/samlang-nodes';
import {
  compileSamlangSourcesToHighIRSources,
  lowerHighIRSourcesToMidIRSources,
  lowerMidIRSourcesToLLVMSources,
} from '@dev-sam/samlang-core/compiler';
import { optimizeHighIRSourcesAccordingToConfiguration } from '@dev-sam/samlang-core/optimization';
import { filterMap } from '@dev-sam/samlang-core/utils';

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

function filePathToModuleReference(sourcePath: string, filePath: string): ModuleReference {
  const relativeFile = normalize(relative(sourcePath, filePath));
  const relativeFileWithoutExtension = relativeFile.substring(0, relativeFile.length - 4);
  return new ModuleReference(relativeFileWithoutExtension.split(sep));
}

export function collectSources({
  sourceDirectory,
}: SamlangProjectConfiguration): readonly (readonly [ModuleReference, string])[] {
  const sourcePath = resolve(sourceDirectory);
  const sources: (readonly [ModuleReference, string])[] = [];

  walk(sourcePath, (file) => {
    if (!file.endsWith('.sam')) return;
    sources.push([filePathToModuleReference(sourcePath, file), readFileSync(file).toString()]);
  });

  return sources;
}

function compileToLLVMSources(
  midIRSources: MidIRSources,
  entryModuleReferences: readonly ModuleReference[],
  outputDirectory: string
): readonly string[] {
  const outputLLVMExportingFilePath = join(outputDirectory, `_all_.ll`);
  mkdirSync(dirname(outputLLVMExportingFilePath), { recursive: true });
  const commonLLVMCode = prettyPrintLLVMSources(lowerMidIRSourcesToLLVMSources(midIRSources));

  const paths = entryModuleReferences.map((moduleReference) => {
    const mainFunctionName = encodeMainFunctionName(moduleReference);
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
    return outputLLVMFilePath;
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
  { outputDirectory, entryPoints }: SamlangProjectConfiguration
): boolean {
  const midIRSources = lowerHighIRSourcesToMidIRSources(
    optimizeHighIRSourcesAccordingToConfiguration(compileSamlangSourcesToHighIRSources(sources))
  );

  mkdirSync(outputDirectory, { recursive: true });
  const commonJSCode = prettyPrintMidIRSourcesAsTSSources(midIRSources);
  const entryModuleReferences = filterMap(entryPoints, (entryPoint) => {
    const entryModuleReference = new ModuleReference(entryPoint.split(sep));
    return sources.has(entryModuleReference) ? entryModuleReference : null;
  });

  entryModuleReferences.forEach((moduleReference) => {
    const mainFunctionName = encodeMainFunctionName(moduleReference);
    const outputJSFilePath = join(outputDirectory, `${moduleReference}.ts`);
    writeFileSync(outputJSFilePath, `${commonJSCode}\n${mainFunctionName}();\n`);
  });

  if (spawnSync('llc', ['--help'], { shell: true, stdio: 'pipe' }).status !== 0) {
    // eslint-disable-next-line no-console
    console.error('You do not have LLVM toolchain installation. Skipping LLVM targets.');
    return true;
  }

  const assembleResults = compileToLLVMSources(
    midIRSources,
    entryModuleReferences,
    outputDirectory
  ).map((modulePath) => {
    const outputProgramPath = modulePath.substring(0, modulePath.length - 3);
    const bitcodePath = `${outputProgramPath}.bc`;
    const success =
      shellOut('llvm-link', '-o', bitcodePath, modulePath, LLVM_LIBRARY_PATH) &&
      shellOut('llc', '-O2', '-filetype=obj', '--relocation-model=pic', bitcodePath) &&
      shellOut('gcc', '-o', outputProgramPath, `${outputProgramPath}.o`);
    unlinkIfExist(`${outputProgramPath}.o`);
    return success;
  });
  return assembleResults.every((it) => it);
}
