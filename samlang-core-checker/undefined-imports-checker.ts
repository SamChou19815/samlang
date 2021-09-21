import type { Sources } from 'samlang-core-ast/common-nodes';
import type { ModuleMembersImport, SamlangModule } from 'samlang-core-ast/samlang-toplevel';
import type { ModuleErrorCollector } from 'samlang-core-errors';
import { filterMap } from 'samlang-core-utils';

class UndefinedImportChecker {
  constructor(
    private readonly sources: Sources<SamlangModule>,
    private readonly errorCollector: ModuleErrorCollector
  ) {}

  checkModuleImports(samlangModule: SamlangModule): SamlangModule {
    const checkedImports = filterMap(samlangModule.imports, this.checkModuleMembersImport);
    return { classes: samlangModule.classes, imports: checkedImports };
  }

  private checkModuleMembersImport = (
    oneImport: ModuleMembersImport
  ): ModuleMembersImport | null => {
    const availableMembers = this.sources.get(oneImport.importedModule);
    if (availableMembers == null) {
      this.errorCollector.reportUnresolvedNameError(
        oneImport.range,
        oneImport.importedModule.toString()
      );
      return null;
    }
    const availableMembersSet = new Set(availableMembers.classes.map((oneClass) => oneClass.name));
    const checkedMemberImports = oneImport.importedMembers.filter(([importedMember, range]) => {
      if (!availableMembersSet.has(importedMember)) {
        this.errorCollector.reportUnresolvedNameError(range, importedMember);
        return false;
      }
      return true;
    });
    return { ...oneImport, importedMembers: checkedMemberImports };
  };
}

export default function checkUndefinedImportsError(
  sources: Sources<SamlangModule>,
  samlangModule: SamlangModule,
  errorCollector: ModuleErrorCollector
): SamlangModule {
  return new UndefinedImportChecker(sources, errorCollector).checkModuleImports(samlangModule);
}
