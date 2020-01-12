package samlang.ast.asm

import samlang.ast.common.StringGlobalVariable

data class AssemblyProgram(
    val globalVariables: List<StringGlobalVariable>,
    val publicFunctions: List<String>,
    val instructions: List<AssemblyInstruction>
)
