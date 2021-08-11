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

import { encodeMainFunctionName } from 'samlang-core-ast/common-names';
import { ModuleReference, Sources } from 'samlang-core-ast/common-nodes';
import { prettyPrintLLVMModule } from 'samlang-core-ast/llvm-nodes';
import type { MidIRSources } from 'samlang-core-ast/mir-nodes';
import type { SamlangModule } from 'samlang-core-ast/samlang-toplevel';
import {
  compileSamlangSourcesToHighIRSources,
  lowerHighIRSourcesToMidIRSources,
  lowerMidIRSourcesToLLVMSources,
} from 'samlang-core-compiler';
import { prettyPrintMidIRSourcesAsJSExportingModule } from 'samlang-core-printer';

import type { SamlangProjectConfiguration } from './configuration';

function walk(startPath: string, visitor: (file: string) => void): void {
  const recursiveVisit = (path: string): void => {
    if (lstatSync(path).isFile()) {
      visitor(path);
      return;
    }

    if (lstatSync(path).isDirectory()) {
      readdirSync(path).some((relativeChildPath) => recursiveVisit(join(path, relativeChildPath)));
    }
  };

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

function compileToJS(
  midIRSources: MidIRSources,
  moduleReferences: readonly ModuleReference[],
  outputDirectory: string
): void {
  const exportingJSFilePath = join(outputDirectory, 'exports.js');
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(
    exportingJSFilePath,
    prettyPrintMidIRSourcesAsJSExportingModule(/* availableWidth */ 100, midIRSources)
  );
  const mainFunctions = new Set(midIRSources.mainFunctionNames);
  moduleReferences.forEach((moduleReference) => {
    const mainFunctionName = encodeMainFunctionName(moduleReference);
    if (!mainFunctions.has(mainFunctionName)) return;
    const outputJSFilePath = join(outputDirectory, `${moduleReference}.js`);
    writeFileSync(outputJSFilePath, `require('./exports').${mainFunctionName}();\n`);
  });
}

function compileToLLVMModules(
  midIRSources: MidIRSources,
  moduleReferences: readonly ModuleReference[],
  outputDirectory: string
): readonly string[] {
  const paths: string[] = [];
  const llvmSources = lowerMidIRSourcesToLLVMSources(midIRSources, moduleReferences);

  moduleReferences.forEach((moduleReference) => {
    const llvmModule = llvmSources.get(moduleReference);
    if (llvmModule == null) return;
    const outputLLVMModuleFilePath = join(outputDirectory, `${moduleReference}.ll`);
    mkdirSync(dirname(outputLLVMModuleFilePath), { recursive: true });
    writeFileSync(outputLLVMModuleFilePath, prettyPrintLLVMModule(llvmModule));
    paths.push(outputLLVMModuleFilePath);
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
    compileSamlangSourcesToHighIRSources(sources)
  );
  const moduleReferences = sources.entries().map(([moduleReference]) => moduleReference);

  compileToJS(midIRSources, moduleReferences, outputDirectory);

  if (spawnSync('llc', ['--help'], { shell: true, stdio: 'pipe' }).status !== 0) {
    // eslint-disable-next-line no-console
    console.error('You do not have LLVM toolchain installation. Skipping LLVM targets.');
    return true;
  }

  const modulePaths = compileToLLVMModules(midIRSources, moduleReferences, outputDirectory);
  const assembleResults = modulePaths.map((modulePath) => {
    const outputProgramPath = modulePath.substring(0, modulePath.length - 3);
    const bitcodePath = `${outputProgramPath}.bc`;
    const success =
      shellOut('llvm-link', '-o', bitcodePath, modulePath, LLVM_LIBRARY_PATH) &&
      shellOut('llc', '-O3', '-filetype=obj', '--relocation-model=pic', bitcodePath) &&
      shellOut('gcc', '-o', outputProgramPath, `${outputProgramPath}.o`);
    unlinkIfExist(bitcodePath);
    unlinkIfExist(`${outputProgramPath}.o`);
    return success;
  });
  return assembleResults.every((it) => it);
}
