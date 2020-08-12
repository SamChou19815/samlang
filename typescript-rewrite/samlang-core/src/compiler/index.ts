import generateAssemblyInstructionsFromMidIRCompilationUnit from './asm';
import compileSamlangSourcesToHighIRSources from './hir';
import compileHighIrSourcesToMidIRCompilationUnits from './mir';

export {
  compileSamlangSourcesToHighIRSources,
  compileHighIrSourcesToMidIRCompilationUnits,
  generateAssemblyInstructionsFromMidIRCompilationUnit,
};
