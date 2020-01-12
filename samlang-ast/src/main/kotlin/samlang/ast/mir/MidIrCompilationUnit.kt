package samlang.ast.mir

import samlang.ast.common.GlobalVariable

data class MidIrCompilationUnit(
    val globalVariables: List<GlobalVariable>,
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
