package samlang.ast

data class Module(val imports: List<ModuleMembersImport>, val classDefinitions: List<ClassDefinition>) {
    override fun toString(): String = "Module"
}
