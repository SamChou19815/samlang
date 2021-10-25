import compileSamlangSourcesToHighIRSources from './hir-toplevel-lowering';
import lowerHighIRSourcesToMidIRSources from './mir-sources-lowering';
import lowerMidIRSourcesToWasmModule from './wasm-module-lowering';

export {
  compileSamlangSourcesToHighIRSources,
  lowerHighIRSourcesToMidIRSources,
  lowerMidIRSourcesToWasmModule,
};
