package samlang.ast

data class Program(val modules: List<Module>) {
    override fun toString(): String = "Program"
}
