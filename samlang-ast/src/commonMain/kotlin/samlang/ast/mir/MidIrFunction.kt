package samlang.ast.mir

import samlang.ast.mir.MidIrExpression.Temporary

data class MidIrFunction(
    val functionName: String,
    val argumentTemps: List<Temporary>,
    val mainBodyStatements: List<MidIrStatement>,
    val numberOfArguments: Int,
    val hasReturn: Boolean,
    val isPublic: Boolean
) {
    override fun toString(): String {
        val bodyBuilder = StringBuilder()
        for (i in argumentTemps.indices) {
            val temp = argumentTemps[i]
            bodyBuilder.append("  ").append(temp).append(" = _ARG").append(i).append(";\n")
        }
        for (statement in mainBodyStatements) {
            bodyBuilder.append("  ").append(statement).append("\n")
        }
        return "$functionName {\n$bodyBuilder}\n"
    }
}
