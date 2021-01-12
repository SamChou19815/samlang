import { spawnSync } from 'child_process';
import { lstatSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join, normalize, dirname, resolve, relative, sep } from 'path';

import type { SamlangProjectConfiguration } from './configuration';

import { ModuleReference, Sources } from 'samlang-core-ast/common-nodes';
import { prettyPrintLLVMModule } from 'samlang-core-ast/llvm-nodes';
import type { SamlangModule } from 'samlang-core-ast/samlang-toplevel';
import { compileSamlangSourcesToHighIRSources } from 'samlang-core-compiler';
import { prettyPrintHighIRModuleAsJS } from 'samlang-core-printer';
import { lowerSourcesToLLVMModules } from 'samlang-core-services';

const walk = (startPath: string, visitor: (file: string) => void): void => {
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
};

export const collectSources = ({
  sourceDirectory,
}: SamlangProjectConfiguration): readonly (readonly [ModuleReference, string])[] => {
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
};

export const compileToJS = (sources: Sources<SamlangModule>, outputDirectory: string): void => {
  const programs = compileSamlangSourcesToHighIRSources(sources);
  const paths: string[] = [];
  programs.forEach((program, moduleReference) => {
    const outputJSFilePath = join(outputDirectory, `${moduleReference}.js`);
    mkdirSync(dirname(outputJSFilePath), { recursive: true });
    writeFileSync(outputJSFilePath, prettyPrintHighIRModuleAsJS(/* availableWidth */ 100, program));
    paths.push(outputJSFilePath);
  });
};

const compileToLLVMModules = (
  sources: Sources<SamlangModule>,
  outputDirectory: string
): readonly string[] => {
  const modules = lowerSourcesToLLVMModules(sources);
  const paths: string[] = [];
  modules.forEach((llvmModule, moduleReference) => {
    const outputLLVMModuleFilePath = join(outputDirectory, `${moduleReference}.ll`);
    mkdirSync(dirname(outputLLVMModuleFilePath), { recursive: true });
    writeFileSync(outputLLVMModuleFilePath, prettyPrintLLVMModule(llvmModule));
    paths.push(outputLLVMModuleFilePath);
  });
  return paths;
};

const RUNTIME_PATH = join(__dirname, '..', 'samlang-runtime');
const LLVM_LIBRARY_PATH = join(RUNTIME_PATH, `libsam-${process.platform}.bc`);

const shellOut = (program: string, ...programArguments: readonly string[]): boolean => {
  return spawnSync(program, programArguments, { shell: true, stdio: 'inherit' }).status === 0;
};

export const compileToExecutablesViaLLVM = (
  sources: Sources<SamlangModule>,
  outputDirectory: string
): boolean => {
  const modulePaths = compileToLLVMModules(sources, outputDirectory);
  const assembleResults = modulePaths.map((modulePath) => {
    const outputProgramPath = modulePath.substring(0, modulePath.length - 3);
    const bitcodePath = `${outputProgramPath}.bc`;
    return (
      shellOut('llvm-link', '-o', bitcodePath, modulePath, LLVM_LIBRARY_PATH) &&
      shellOut('llc', '-O3', '-filetype=obj', '--relocation-model=pic', bitcodePath) &&
      shellOut('gcc', '-o', outputProgramPath, `${outputProgramPath}.o`)
    );
  });
  return assembleResults.every((it) => it);
};
