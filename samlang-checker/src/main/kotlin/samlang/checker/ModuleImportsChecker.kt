package samlang.checker

import samlang.ast.lang.Module
import samlang.ast.common.ModuleMembersImport
import samlang.ast.lang.Sources
import samlang.errors.UnresolvedNameError

internal fun checkUndefinedImportsError(sources: Sources, module: Module, errorCollector: ErrorCollector): Module =
    ModuleImportsChecker(sources = sources, errorCollector = errorCollector).checkModuleImports(module = module)

private class ModuleImportsChecker(private val sources: Sources, private val errorCollector: ErrorCollector) {

    fun checkModuleImports(module: Module): Module {
        val checkedImports = module.imports.mapNotNull(transform = ::checkModuleMembersImport)
        return module.copy(imports = checkedImports)
    }

    private fun checkModuleMembersImport(import: ModuleMembersImport): ModuleMembersImport? {
        val availableMembers = sources.moduleMappings[import.importedModule]
        if (availableMembers == null) {
            errorCollector.add(
                compileTimeError = UnresolvedNameError(
                    unresolvedName = import.importedModule.toString(),
                    range = import.range
                )
            )
            return null
        }
        val availableMembersSet = availableMembers.classDefinitions.map { it.name }.toSet()
        val checkedMemberImports = import.importedMembers.filter { (importedMember, range) ->
            val isWellDefined = importedMember in availableMembersSet
            if (!isWellDefined) {
                errorCollector.add(
                    compileTimeError = UnresolvedNameError(unresolvedName = importedMember, range = range)
                )
            }
            isWellDefined
        }
        return import.copy(importedMembers = checkedMemberImports)
    }
}
