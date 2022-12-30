import binaryen from "binaryen";
import type { MidIRSources } from "../ast/mir-nodes";
import { prettyPrintWebAssemblyModule } from "../ast/wasm-nodes";
import compileSamlangSourcesToHighIRSources from "./hir-toplevel-lowering";
import LIBSAM_WAT from "./libsam.wat";
import lowerHighIRSourcesToMidIRSources from "./mir-sources-lowering";
import lowerMidIRSourcesToWasmModuleInInternalAST from "./wasm-module-lowering";

interface BinaryenModule {
  emitBinary(): Uint8Array;
  emitText(): string;
  dispose(): void;
}

function lowerMidIRSourcesToWasmModule(midIRSources: MidIRSources): BinaryenModule {
  const unoptimizedWasmModule = prettyPrintWebAssemblyModule(
    lowerMidIRSourcesToWasmModuleInInternalAST(midIRSources),
  );
  return binaryen.parseText(`(module\n${LIBSAM_WAT}\n${unoptimizedWasmModule}\n)\n`);
}

export {
  compileSamlangSourcesToHighIRSources,
  lowerHighIRSourcesToMidIRSources,
  lowerMidIRSourcesToWasmModule,
};
