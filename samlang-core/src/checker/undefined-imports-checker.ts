import type { Sources, ModuleMembersImport } from '../ast/common/structs';
import type { SamlangModule } from '../ast/samlang-toplevel';
import type { ModuleErrorCollector } from '../errors';
import { isNotNull } from '../util/type-assertions';

class UndefinedImportChecker {
  constructor(
    private readonly sources: Sources<SamlangModule>,
    private readonly errorCollector: ModuleErrorCollector
  ) {}

  checkModuleImports(samlangModule: SamlangModule): SamlangModule {
    const checkedImports = samlangModule.imports
      .map(this.checkModuleMembersImport)
      .filter(isNotNull);
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
    const availableMembersSet = new Set(
      availableMembers.classes
        .map((oneClass) => (oneClass.isPublic ? oneClass.name : null))
        .filter(isNotNull)
    );
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

const checkUndefinedImportsError = (
  sources: Sources<SamlangModule>,
  samlangModule: SamlangModule,
  errorCollector: ModuleErrorCollector
): SamlangModule =>
  new UndefinedImportChecker(sources, errorCollector).checkModuleImports(samlangModule);

export default checkUndefinedImportsError;
