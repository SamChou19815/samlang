package samlang.printer

import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.SetOnFlag
import samlang.ast.asm.AssemblyProgram
import samlang.ast.common.GlobalVariable
import samlang.util.StringBuilderPrintDevice

/**
 * The printer utility for assembly instructions.
 * It is used to printed already compiled assembly.
 *
 * @param includeComments whether to include comments.
 */
@ExperimentalStdlibApi
class AssemblyPrinter(private val includeComments: Boolean, private val osTarget: OsTarget) {
    private val device: StringBuilderPrintDevice = StringBuilderPrintDevice()

    fun printProgram(program: AssemblyProgram): String {
        printlnInstruction(instructionLine = ".text")
        printlnInstruction(instructionLine = ".intel_syntax noprefix")
        printlnInstruction(instructionLine = ".p2align 4, 0x90")
        printlnInstruction(instructionLine = ".align 8")
        for (publicFunction in program.publicFunctions) {
            printlnInstruction(instructionLine = ".globl $publicFunction")
        }
        program.instructions.forEach { printInstruction(instruction = it) }
        when (osTarget) {
            OsTarget.LINUX -> printlnInstruction(instructionLine = ".section .ctors")
            OsTarget.MAC_OS -> printlnInstruction(instructionLine = ".mod_init_func")
            OsTarget.WINDOWS -> printlnInstruction(instructionLine = ".section .ctors,\"w\"")
        }
        printlnInstruction(instructionLine = ".align 8")
        // global vars init
        program.globalVariables.forEach { printGlobalVariable(globalVariable = it) }
        return device.dump()
    }

    private fun printInstruction(instruction: AssemblyInstruction) {
        when (instruction) {
            is AssemblyInstruction.Label -> device.println(instruction)
            is SetOnFlag -> instruction.toString().split("\n").forEach { printlnInstruction(it) }
            else -> printlnInstruction(instruction.toString())
        }
    }

    private fun printGlobalVariable(globalVariable: GlobalVariable) {
        val (name, content) = globalVariable
        printlnInstruction(instructionLine = ".data")
        printlnInstruction(instructionLine = ".align 8")
        device.println("$name:")
        printlnInstruction(instructionLine = ".quad ${content.length}")
        content.toCharArray().forEach { character ->
            printlnInstruction(instructionLine = ".quad ${character.toLong()} ## $character")
        }
        printlnInstruction(instructionLine = ".text")
    }

    private fun printlnInstruction(instructionLine: String) {
        device.println("\t" + instructionLine)
    }
}
