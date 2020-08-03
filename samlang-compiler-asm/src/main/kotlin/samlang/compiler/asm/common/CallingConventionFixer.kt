package samlang.compiler.asm.common

import samlang.ast.asm.AssemblyArgs.CONST
import samlang.ast.asm.AssemblyArgs.RBP
import samlang.ast.asm.AssemblyArgs.RSP
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.AlBinaryOpType.SUB
import samlang.ast.asm.AssemblyInstruction.CallAddress
import samlang.ast.asm.AssemblyInstruction.Companion.BIN_OP
import samlang.ast.asm.AssemblyInstruction.Companion.COMMENT
import samlang.ast.asm.AssemblyInstruction.Companion.MOVE
import samlang.ast.asm.AssemblyInstruction.Companion.POP
import samlang.ast.asm.AssemblyInstruction.Companion.PUSH
import samlang.ast.asm.AssemblyInstruction.Companion.RET

/**
 * The class used to generate prologue and epilogue of functions according System-V calling
 * conventions.
 *
 * @param context calling convention context for function body.
 * @param numberOfTemporariesOnStack number of temporaries to spill onto the stack.
 * @param mainFunctionBody the not-yet-fixed main function body, generated during tiling.
 * @param removeComments whether to cleanup comments.
 */
class CallingConventionFixer(
    private val context: FunctionContext,
    private val numberOfTemporariesOnStack: Int,
    private val mainFunctionBody: List<AssemblyInstruction>,
    private val removeComments: Boolean
) {
    /** The fixed instructions to be returned to the caller. */
    private val fixedInstructions: MutableList<AssemblyInstruction> = mutableListOf()
    /** Whether the function is not a leaf function. */
    private val isLeafFunction: Boolean = mainFunctionBody.none { it is CallAddress }

    init {
        fixBody()
    }

    /**
     * @return a list of instructions for the function body, with calling convention issues fixed.
     */
    val bodyWithCorrectCallingConvention: List<AssemblyInstruction>
        get() = fixedInstructions

    /**
     * Fix the body to make it be in accordance with System-V calling convention.
     */
    private fun fixBody() {
        if (!removeComments) {
            fixedInstructions += COMMENT(comment = context.functionName + " prologue starts")
        }
        var stackPushDownCount = numberOfTemporariesOnStack
        if (!isLeafFunction && stackPushDownCount % 2 == 1) { // not a leaf function, align alignment matters!
            stackPushDownCount++
        }
        // not leaf function -> will override rbp, has still -> need rbp
        val needToUseRBP = !isLeafFunction || numberOfTemporariesOnStack > 0
        if (needToUseRBP) {
            fixedInstructions += PUSH(RBP)
            fixedInstructions += MOVE(RBP, RSP)
        }
        if (stackPushDownCount > 0) { // no need to move rsp pointer if no stack variables are used
            fixedInstructions += BIN_OP(SUB, RSP, CONST(value = 8 * stackPushDownCount))
        }
        if (!removeComments) {
            fixedInstructions += COMMENT(comment = context.functionName + " prologue ends")
        }
        // body
        fixedInstructions += mainFunctionBody
        if (!removeComments) {
            fixedInstructions += COMMENT(comment = context.functionName + " epilogue starts")
        }
        if (needToUseRBP) {
            fixedInstructions += MOVE(RSP, RBP)
            fixedInstructions += POP(RBP)
        }
        fixedInstructions += RET()
        if (!removeComments) {
            fixedInstructions += COMMENT(context.functionName + " epilogue ends")
        }
    }
}
