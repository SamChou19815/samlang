package samlang.ast.mir

import samlang.ast.common.StringGlobalVariable

data class MidIrCompilationUnit(
    val globalVariables: List<StringGlobalVariable>,
    val functions: List<MidIrFunction>
) {
    override fun toString(): String {
        val sb = StringBuilder()
        for (value in functions) {
            sb.append(value).append('\n')
        }
        return sb.toString()
    }
}
