import { Module, parseText as parseWasmText } from 'binaryen';
import type { MidIRSources } from '../ast/mir-nodes';
import { prettyPrintWebAssemblyModule } from '../ast/wasm-nodes';
import compileSamlangSourcesToHighIRSources from './hir-toplevel-lowering';
import LIBSAM_WAT from './libsam.wat';
import lowerHighIRSourcesToMidIRSources from './mir-sources-lowering';
import lowerMidIRSourcesToWasmModuleInInternalAST from './wasm-module-lowering';

function lowerMidIRSourcesToWasmModule(midIRSources: MidIRSources): Module {
  const unoptimizedWasmModule = prettyPrintWebAssemblyModule(
    lowerMidIRSourcesToWasmModuleInInternalAST(midIRSources)
  );
  const wasmModule = parseWasmText(`(module\n${LIBSAM_WAT}\n${unoptimizedWasmModule}\n)\n`);
  wasmModule.optimize();
  return wasmModule;
}

export {
  compileSamlangSourcesToHighIRSources,
  lowerHighIRSourcesToMidIRSources,
  lowerMidIRSourcesToWasmModule,
};
