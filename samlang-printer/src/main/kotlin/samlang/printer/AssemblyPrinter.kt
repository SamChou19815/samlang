package samlang.printer

import java.io.PrintWriter
import java.io.StringWriter
import java.io.Writer
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.SetOnFlag
import samlang.ast.asm.AssemblyProgram
import samlang.ast.common.GlobalVariable

/**
 * The printer utility for assembly instructions.
 * It is used to printed already compiled assembly.
 *
 * @param writer the Java writer to use.
 * @param hasInstructionTabPrefix whether to add tab before each instruction.
 * @param includeComments whether to include comments.
 */
class AssemblyPrinter private constructor(
    writer: Writer,
    private val hasInstructionTabPrefix: Boolean,
    private val includeComments: Boolean
) {
    /** The printer to use.  */
    private val printer: PrintWriter = if (writer is PrintWriter) writer else PrintWriter(writer)

    /**
     * @param writer the Java writer to use.
     * @param includeComments whether to include comments.
     */
    constructor(writer: Writer, includeComments: Boolean) : this(
        writer = writer,
        hasInstructionTabPrefix = true,
        includeComments = includeComments
    )

    fun printProgram(program: AssemblyProgram) {
        printlnInstruction(instructionLine = ".text")
        printlnInstruction(instructionLine = ".intel_syntax noprefix")
        printlnInstruction(instructionLine = ".p2align 4, 0x90")
        printlnInstruction(instructionLine = ".align 8")
        printlnInstruction(instructionLine = ".globl _Imain_paai")
        for (publicFunction in program.publicFunctions) {
            printlnInstruction(instructionLine = ".globl $publicFunction")
        }
        program.instructions.forEach { printInstruction(instruction = it) }
        when (OsTarget.DEFAULT) {
            OsTarget.LINUX -> printlnInstruction(instructionLine = ".section .ctors")
            OsTarget.MAC_OS -> printlnInstruction(instructionLine = ".mod_init_func")
            OsTarget.WINDOWS -> printlnInstruction(instructionLine = ".section .ctors,\"w\"")
        }
        printlnInstruction(instructionLine = ".align 8")
        // global vars init
        for ((referenceVariable, contentVariable, content) in program.globalVariables) {
            printGlobalVariable(globalVariable = referenceVariable, content = null)
            printGlobalVariable(globalVariable = contentVariable, content = content)
        }
        printer.flush()
    }

    private fun printInstruction(instruction: AssemblyInstruction) {
        when (instruction) {
            is AssemblyInstruction.Label -> printer.println(instruction)
            is SetOnFlag -> instruction.toString().split("\n").forEach { printlnInstruction(it) }
            else -> printlnInstruction(instruction.toString())
        }
    }

    private fun printGlobalVariable(globalVariable: GlobalVariable, content: String?) {
        val (name, size) = globalVariable
        printlnInstruction(instructionLine = ".data")
        printlnInstruction(instructionLine = ".align 8")
        printer.println("$name:")
        if (content == null) {
            printlnInstruction(instructionLine = ".zero $size")
        } else {
            printlnInstruction(instructionLine = ".quad $size")
            content.chars().forEach { character ->
                printlnInstruction(instructionLine = ".quad $character ## ${character.toChar()}")
            }
        }
        printlnInstruction(instructionLine = ".text")
    }

    private fun printlnInstruction(instructionLine: String) {
        if (hasInstructionTabPrefix) {
            printer.println("\t" + instructionLine)
        } else {
            printer.println(instructionLine)
        }
    }

    companion object {
        @JvmStatic
        fun instructionsToString(instructions: List<AssemblyInstruction>): String {
            val stringWriter = StringWriter()
            val printer = AssemblyPrinter(
                writer = stringWriter,
                hasInstructionTabPrefix = false,
                includeComments = true
            )
            instructions.forEach { printer.printInstruction(instruction = it) }
            return stringWriter.toString()
        }
    }
}
