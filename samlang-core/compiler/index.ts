import compileSamlangSourcesToHighIRSources from './hir-toplevel-lowering';
import lowerMidIRSourcesToLLVMSources from './llvm-sources-lowering';
import lowerHighIRSourcesToMidIRSources from './mir-sources-lowering';
import lowerMidIRSourcesToWasmModule from './wasm-module-lowering';

export {
  compileSamlangSourcesToHighIRSources,
  lowerHighIRSourcesToMidIRSources,
  lowerMidIRSourcesToLLVMSources,
  lowerMidIRSourcesToWasmModule,
};
