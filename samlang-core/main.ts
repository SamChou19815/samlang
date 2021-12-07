import { encodeMainFunctionName } from './ast/common-names';
import { ModuleReference } from './ast/common-nodes';
import { prettyPrintMidIRSourcesAsTSSources } from './ast/mir-nodes';
import { typeCheckSourceHandles } from './checker';
import {
  compileSamlangSourcesToHighIRSources,
  lowerHighIRSourcesToMidIRSources,
  lowerMidIRSourcesToWasmModule,
} from './compiler';
import type { SamlangSingleSourceCompilationResult, SamlangSourcesCompilationResult } from './dist';
import samlangGeneratedWebAssemblyLoader from './loader';
import { optimizeHighIRSourcesAccordingToConfiguration } from './optimization';
import { parseSources } from './parser';
import prettyPrintSamlangModule from './printer';
import { assert } from './utils';

export function reformatSamlangSources(
  sourceHandles: readonly (readonly [ModuleReference, string])[]
): readonly (readonly [ModuleReference, string])[] {
  return parseSources(sourceHandles).map(([moduleReference, samlangModule]) => [
    moduleReference,
    prettyPrintSamlangModule(100, samlangModule),
  ]);
}

const EMITTED_WASM_FILE = '__all__.wasm';
const EMITTED_WAT_FILE = '__all__.wat';

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
  const commonTSCode = prettyPrintMidIRSourcesAsTSSources(midIRSources);
  const wasmModule = lowerMidIRSourcesToWasmModule(midIRSources);

  const emittedCode: Record<string, string | Uint8Array> = {};
  entryModuleReferences.forEach((moduleReference) => {
    const mainFunctionName = encodeMainFunctionName(moduleReference);
    const tsCode = `${commonTSCode}\n${mainFunctionName}();\n`;
    const wasmJSCode = `// @${'generated'}
const binary = require('fs').readFileSync(require('path').join(__dirname, '${EMITTED_WASM_FILE}'));
require('@dev-sam/samlang-cli/loader')(binary).${mainFunctionName}();
`;
    emittedCode[`${moduleReference}.ts`] = tsCode;
    emittedCode[`${moduleReference}.wasm.js`] = wasmJSCode;
  });
  emittedCode[EMITTED_WASM_FILE] = wasmModule.emitBinary();
  emittedCode[EMITTED_WAT_FILE] = wasmModule.emitText();
  wasmModule.dispose();

  return { __type__: 'OK', emittedCode };
}

function interpretWebAssemblyModule(
  emittedWasmBinary: Uint8Array,
  mainFunctionName: string
): string {
  let printed = '';
  const functions = samlangGeneratedWebAssemblyLoader(emittedWasmBinary, (pointerToString) => ({
    __Builtins_println(p: number) {
      printed += pointerToString(p);
      printed += '\n';
      return 0;
    },
  }));
  functions[mainFunctionName]?.();
  return printed;
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
  const emittedTSCode = result.emittedCode['Demo.ts'];
  const emittedWasmBinary = result.emittedCode[EMITTED_WASM_FILE];
  assert(typeof emittedTSCode === 'string' && emittedWasmBinary instanceof Uint8Array);
  const interpreterResult = interpretWebAssemblyModule(
    emittedWasmBinary,
    encodeMainFunctionName(demoModuleReference)
  );
  return { __type__: 'OK', emittedTSCode, interpreterResult };
}

export { ModuleReference, Range } from './ast/common-nodes';
export { default as createSamlangLanguageService } from './services';
