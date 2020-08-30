import generateAssemblyInstructionsFromMidIRCompilationUnit from './asm-toplevel-generator';
import compileSamlangSourcesToHighIRSources from './hir-toplevel-lowering';
import compileHighIrModuleToMidIRCompilationUnit from './mir-toplevel-lowering';

export {
  compileSamlangSourcesToHighIRSources,
  compileHighIrModuleToMidIRCompilationUnit,
  generateAssemblyInstructionsFromMidIRCompilationUnit,
};
