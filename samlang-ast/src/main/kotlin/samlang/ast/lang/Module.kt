package samlang.ast.lang

import samlang.ast.common.ModuleMembersImport

data class Module(val imports: List<ModuleMembersImport>, val classDefinitions: List<ClassDefinition>)
