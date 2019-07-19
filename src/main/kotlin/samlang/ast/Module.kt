package samlang.ast

data class Module(val imports: List<Pair<String, Range>>, val classDefinitions: List<ClassDefinition>) {
    override fun toString(): String = "Module"
}
