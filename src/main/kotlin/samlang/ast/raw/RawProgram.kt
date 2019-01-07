package samlang.ast.raw

data class RawProgram(val modules: List<RawModule>) {

    override fun toString(): String = "RawProgram"

}
