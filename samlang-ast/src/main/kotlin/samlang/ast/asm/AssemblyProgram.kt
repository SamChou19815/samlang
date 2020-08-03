package samlang.ast.asm

import samlang.ast.common.GlobalVariable
import samlang.ast.common.IrNameEncoder

@ExperimentalStdlibApi
data class AssemblyProgram(val globalVariables: List<GlobalVariable>, val instructions: List<AssemblyInstruction>) {
    override fun toString(): String {
        val sb = StringBuilder()
        sb.append("    .text\n")
        sb.append("    .intel_syntax noprefix\n")
        sb.append("    .p2align 4, 0x90\n")
        sb.append("    .align 8\n")
        sb.append("    .globl ${IrNameEncoder.compiledProgramMain}\n")
        instructions.forEach { instruction ->
            when (instruction) {
                is AssemblyInstruction.Label -> sb.append(instruction).append("\n")
                is AssemblyInstruction.SetOnFlag -> instruction.toString().split("\n").forEach {
                    sb.append("    ").append(it).append("\n")
                }
                else -> sb.append("    ").append(instruction).append("\n")
            }
        }
        globalVariables.forEach { globalVariable ->
            val (name, content) = globalVariable
            sb.append("    .data\n")
            sb.append("    .align 8\n")
            sb.append(name).append(":\n")
            sb.append("    .quad ${content.length}\n")
            content.toCharArray().forEach { character -> sb.append("    .quad ${character.toLong()} ## $character\n") }
            sb.append("    .text\n")
        }
        return sb.toString()
    }
}
