package samlang.ast

data class Program(val imports: List<Pair<String, Range>>, val modules: List<Module>) {
    override fun toString(): String = "Program"
}
