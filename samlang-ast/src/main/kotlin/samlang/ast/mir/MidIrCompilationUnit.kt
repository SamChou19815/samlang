package samlang.ast.mir

import samlang.ast.common.StringGlobalVariable

data class MidIrCompilationUnit(
    val globalVariables: List<StringGlobalVariable>,
    val functions: Map<String, MidIrFunction>
) {
    override fun toString(): String {
        val sb = StringBuilder()
        for (value in functions.values) {
            sb.append(value).append('\n')
        }
        return sb.toString()
    }
}
