import { moduleReferenceToString, Sources } from "../ast/common-nodes";
import type { SamlangModule, SourceModuleMembersImport } from "../ast/samlang-nodes";
import type { GlobalErrorReporter } from "../errors";
import { filterMap } from "../utils";

class UndefinedImportChecker {
  constructor(
    private readonly sources: Sources<SamlangModule>,
    private readonly errorReporter: GlobalErrorReporter,
  ) {}

  checkModuleImports(samlangModule: SamlangModule): SamlangModule {
    const checkedImports = filterMap(samlangModule.imports, this.checkModuleMembersImport);
    return {
      classes: samlangModule.classes,
      interfaces: samlangModule.interfaces,
      imports: checkedImports,
    };
  }

  private checkModuleMembersImport = (
    oneImport: SourceModuleMembersImport,
  ): SourceModuleMembersImport | null => {
    const availableMembers = this.sources.get(oneImport.importedModule);
    if (availableMembers == null) {
      this.errorReporter.reportUnresolvedNameError(
        oneImport.location,
        moduleReferenceToString(oneImport.importedModule),
      );
      return null;
    }
    const availableMembersSet = new Set(
      [...availableMembers.classes, ...availableMembers.interfaces].map(
        (oneClass) => oneClass.name.name,
      ),
    );
    const checkedMemberImports = oneImport.importedMembers.filter(
      ({ name: importedMember, location }) => {
        if (!availableMembersSet.has(importedMember)) {
          this.errorReporter.reportUnresolvedNameError(location, importedMember);
          return false;
        }
        return true;
      },
    );
    return { ...oneImport, importedMembers: checkedMemberImports };
  };
}

export default function checkUndefinedImportsError(
  sources: Sources<SamlangModule>,
  samlangModule: SamlangModule,
  errorReporter: GlobalErrorReporter,
): SamlangModule {
  return new UndefinedImportChecker(sources, errorReporter).checkModuleImports(samlangModule);
}
