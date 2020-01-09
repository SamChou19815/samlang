package samlang.ast.hir

import samlang.ast.common.ModuleMembersImport

data class HighIrModule(val imports: List<ModuleMembersImport>, val classDefinitions: List<HighIrClassDefinition>)
