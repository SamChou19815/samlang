import generateAssemblyInstructionsFromMidIRCompilationUnit from './asm-toplevel-generator';
import compileSamlangSourcesToHighIRSources from './hir-toplevel-lowering';
import { compileHighIrSourcesToMidIRCompilationUnits } from './mir-toplevel-lowering';

export {
  compileSamlangSourcesToHighIRSources,
  compileHighIrSourcesToMidIRCompilationUnits,
  generateAssemblyInstructionsFromMidIRCompilationUnit,
};
