import generateAssemblyInstructionsFromMidIRCompilationUnit from './asm';
import compileSamlangSourcesToHighIRSources from './hir';
import {
  compileHighIrSourcesToMidIRCompilationUnitWithMultipleEntries,
  compileHighIrSourcesToMidIRCompilationUnitWithSingleEntry,
} from './mir';

export {
  compileSamlangSourcesToHighIRSources,
  compileHighIrSourcesToMidIRCompilationUnitWithMultipleEntries,
  compileHighIrSourcesToMidIRCompilationUnitWithSingleEntry,
  generateAssemblyInstructionsFromMidIRCompilationUnit,
};
