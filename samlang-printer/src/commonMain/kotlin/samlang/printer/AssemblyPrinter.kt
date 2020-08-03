package samlang.printer

import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.SetOnFlag
import samlang.ast.asm.AssemblyProgram
import samlang.ast.common.GlobalVariable
import samlang.ast.common.IrNameEncoder

/**
 * The printer utility for assembly instructions.
 * It is used to printed already compiled assembly.
 *
 * @param includeComments whether to include comments.
 */
@ExperimentalStdlibApi
class AssemblyPrinter(private val includeComments: Boolean) {
    private val sb: StringBuilder = StringBuilder()

    fun printProgram(program: AssemblyProgram): String {
        printlnInstruction(instructionLine = ".text")
        printlnInstruction(instructionLine = ".intel_syntax noprefix")
        printlnInstruction(instructionLine = ".p2align 4, 0x90")
        printlnInstruction(instructionLine = ".align 8")
        printlnInstruction(instructionLine = ".globl ${IrNameEncoder.compiledProgramMain}")
        program.instructions.forEach { printInstruction(instruction = it) }
        // global vars init
        program.globalVariables.forEach { printGlobalVariable(globalVariable = it) }
        return sb.toString()
    }

    private fun printInstruction(instruction: AssemblyInstruction) {
        when (instruction) {
            is AssemblyInstruction.Label -> sb.append(instruction).append("\n")
            is SetOnFlag -> instruction.toString().split("\n").forEach { printlnInstruction(it) }
            else -> printlnInstruction(instruction.toString())
        }
    }

    private fun printGlobalVariable(globalVariable: GlobalVariable) {
        val (name, content) = globalVariable
        printlnInstruction(instructionLine = ".data")
        printlnInstruction(instructionLine = ".align 8")
        sb.append(name).append(":\n")
        printlnInstruction(instructionLine = ".quad ${content.length}")
        content.toCharArray().forEach { character ->
            printlnInstruction(instructionLine = ".quad ${character.toLong()} ## $character")
        }
        printlnInstruction(instructionLine = ".text")
    }

    private fun printlnInstruction(instructionLine: String) {
        sb.append("    ").append(instructionLine).append("\n")
    }
}
