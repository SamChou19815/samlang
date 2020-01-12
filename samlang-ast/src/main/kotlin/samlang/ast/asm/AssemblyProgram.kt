package samlang.ast.asm

import samlang.ast.common.StringGlobalVariable

data class AssemblyProgram(
    val globalVariables: List<StringGlobalVariable>,
    val publicFunctions: List<String>,
    val instructions: List<AssemblyInstruction>
) {
    override fun toString(): String = TODO(reason = "Not implemented")
}
