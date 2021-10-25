import { encodeMainFunctionName } from './ast/common-names';
import { ModuleReference } from './ast/common-nodes';
import { prettyPrintLLVMSources } from './ast/llvm-nodes';
import { prettyPrintMidIRSourcesAsTSSources } from './ast/mir-nodes';
import { prettyPrintWebAssemblyModule, wasmJSAdapter } from './ast/wasm-nodes';
import { typeCheckSourceHandles } from './checker';
import {
  compileSamlangSourcesToHighIRSources,
  lowerHighIRSourcesToMidIRSources,
  lowerMidIRSourcesToLLVMSources,
  lowerMidIRSourcesToWasmModule,
} from './compiler';
import type { SamlangSourcesCompilationResult, SamlangSingleSourceCompilationResult } from './dist';
import { optimizeHighIRSourcesAccordingToConfiguration } from './optimization';
import { parseSources } from './parser';
import prettyPrintSamlangModule from './printer';
import { checkNotNull } from './utils';

export function reformatSamlangSources(
  sourceHandles: readonly (readonly [ModuleReference, string])[]
): readonly (readonly [ModuleReference, string])[] {
  return parseSources(sourceHandles).map(([moduleReference, samlangModule]) => [
    moduleReference,
    prettyPrintSamlangModule(100, samlangModule),
  ]);
}

export function compileSamlangSources(
  sourceHandles: readonly (readonly [ModuleReference, string])[],
  entryModuleReferences: readonly ModuleReference[]
): SamlangSourcesCompilationResult {
  const { checkedSources: sources, compileTimeErrors } = typeCheckSourceHandles(sourceHandles);
  const errors = compileTimeErrors.map((it) => it.toString()).sort((a, b) => a.localeCompare(b));
  entryModuleReferences.forEach((moduleReference) => {
    if (!sources.has(moduleReference)) {
      errors.unshift(`Invalid entry point: ${moduleReference} does not exist.`);
    }
  });
  if (errors.length > 0) {
    return { __type__: 'ERROR', errors };
  }

  const midIRSources = lowerHighIRSourcesToMidIRSources(
    optimizeHighIRSourcesAccordingToConfiguration(compileSamlangSourcesToHighIRSources(sources))
  );
  const commonJSCode = prettyPrintMidIRSourcesAsTSSources(midIRSources);
  const emittedTypeScriptCode = Object.fromEntries(
    entryModuleReferences.map((moduleReference) => [
      `${moduleReference}.ts`,
      `${commonJSCode}\n${encodeMainFunctionName(moduleReference)}();\n`,
    ])
  );

  const commonLLVMCode = prettyPrintLLVMSources(lowerMidIRSourcesToLLVMSources(midIRSources));
  const emittedLLVMCode = Object.fromEntries(
    entryModuleReferences.map((moduleReference) => [
      `${moduleReference}.ll`,
      `${commonLLVMCode}
define i64 @_compiled_program_main() local_unnamed_addr nounwind {
  call i64 @${encodeMainFunctionName(moduleReference)}() nounwind
  ret i64 0
}
`,
    ])
  );

  const emittedWasmCode = prettyPrintWebAssemblyModule(lowerMidIRSourcesToWasmModule(midIRSources));
  const emittedWasmRunnerCode = Object.fromEntries(
    entryModuleReferences.map((moduleReference) => [
      `${moduleReference}.js`,
      `require('./__all__').${encodeMainFunctionName(moduleReference)}();\n`,
    ])
  );
  emittedTypeScriptCode['__all__.js'] = wasmJSAdapter;

  return {
    __type__: 'OK',
    emittedTypeScriptCode,
    emittedLLVMCode,
    emittedWasmCode,
    emittedWasmRunnerCode,
  };
}

export function compileSingleSamlangSource(
  programString: string
): SamlangSingleSourceCompilationResult {
  const demoModuleReference = new ModuleReference(['Demo']);
  const result = compileSamlangSources(
    [[demoModuleReference, programString]],
    [demoModuleReference]
  );
  if (result.__type__ === 'ERROR') return result;
  const emittedTypeScriptCode = checkNotNull(result.emittedTypeScriptCode['Demo.ts']);
  const emittedLLVMCode = checkNotNull(result.emittedLLVMCode['Demo.ll']);
  return {
    __type__: 'OK',
    emittedTypeScriptCode,
    emittedLLVMCode,
    emittedWasmCode: result.emittedWasmCode,
  };
}
