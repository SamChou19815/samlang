package samlang.printer

import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.SetOnFlag
import samlang.ast.asm.AssemblyProgram
import samlang.ast.common.GlobalVariable
import samlang.ast.common.IrNameEncoder

/**
 * The printer utility for assembly instructions.
 * It is used to printed already compiled assembly.
 */
@ExperimentalStdlibApi
class AssemblyPrinter {
    fun printProgram(program: AssemblyProgram): String {
        val sb = StringBuilder()
        sb.append("    .text\n")
        sb.append("    .intel_syntax noprefix\n")
        sb.append("    .p2align 4, 0x90\n")
        sb.append("    .align 8\n")
        sb.append("    .globl ${IrNameEncoder.compiledProgramMain}\n")
        program.instructions.forEach { instruction ->
            when (instruction) {
                is AssemblyInstruction.Label -> sb.append(instruction).append("\n")
                is SetOnFlag -> instruction.toString().split("\n").forEach {
                    sb.append("    ").append(it).append("\n")
                }
                else -> sb.append("    ").append(instruction).append("\n")
            }
        }
        // global vars init
        program.globalVariables.forEach { globalVariable ->
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
