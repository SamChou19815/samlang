package samlang.ast.lang

data class Module(val imports: List<ModuleMembersImport>, val classDefinitions: List<ClassDefinition>)
