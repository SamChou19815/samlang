package samlang.ast

data class Source(val imports: List<Pair<String, Range>>, val modules: List<Module>) {
    override fun toString(): String = "Source"
}
