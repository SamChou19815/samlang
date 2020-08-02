package samlang.compiler.asm.common

import samlang.ast.asm.AssemblyArgs.REG
import samlang.ast.asm.AssemblyArgs.Reg
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.Companion.JUMP
import samlang.ast.asm.AssemblyInstruction.Companion.LABEL
import samlang.ast.asm.AssemblyInstruction.JumpType

/** The mutable tiling context used to allocate registers and provide background information. */
class FunctionContext(val functionName: String, val hasReturn: Boolean) {
    /** The id to allocate next. */
    private var nextRegisterId: Int = 0

    /** @return the allocated next register. */
    fun nextReg(): Reg {
        val id = nextRegisterId
        nextRegisterId++
        return REG(id = "INFINITE_REG_$id")
    }

    /** @return the label instruction for starting function call epilogue. */
    val functionCallEpilogueLabelStatement: AssemblyInstruction
        get() = LABEL(label = "LABEL_FUNCTION_CALL_EPILOGUE_FOR_$functionName")

    /** @return the jump instruction for jumping to function call epilogue. */
    val jumpToFunctionCallEpilogue: AssemblyInstruction
        get() = JUMP(type = JumpType.JMP, label = "LABEL_FUNCTION_CALL_EPILOGUE_FOR_$functionName")
}
