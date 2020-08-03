package samlang.compiler.asm

import samlang.ast.asm.AssemblyArgs.CONST
import samlang.ast.asm.AssemblyArgs.R8
import samlang.ast.asm.AssemblyArgs.R9
import samlang.ast.asm.AssemblyArgs.RBP
import samlang.ast.asm.AssemblyArgs.RCX
import samlang.ast.asm.AssemblyArgs.RDI
import samlang.ast.asm.AssemblyArgs.RDX
import samlang.ast.asm.AssemblyArgs.RSI
import samlang.ast.asm.AssemblyArgs.RSP
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.AlBinaryOpType.SUB
import samlang.ast.asm.AssemblyInstruction.Companion.BIN_OP
import samlang.ast.asm.AssemblyInstruction.Companion.COMMENT
import samlang.ast.asm.AssemblyInstruction.Companion.LABEL
import samlang.ast.asm.AssemblyInstruction.Companion.MOVE
import samlang.ast.asm.AssemblyInstruction.Companion.POP
import samlang.ast.asm.AssemblyInstruction.Companion.PUSH
import samlang.ast.asm.AssemblyInstruction.Companion.RET
import samlang.ast.asm.AssemblyProgram
import samlang.ast.common.IrOperator
import samlang.ast.mir.MidIrCompilationUnit
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrFunction
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.MoveTemp
import samlang.compiler.asm.ralloc.RealRegisterAllocator
import samlang.compiler.asm.tiling.DpTiling
import samlang.optimization.SimpleOptimizations

/** The assembly generator. */
@ExperimentalStdlibApi
object AssemblyGenerator {
    /**
     * Generate assembly instructions for a compilation unit.
     *
     * @param compilationUnit the compilation unit.
     * @param removeComments whether to remove comments.
     * @return the generated assembly instructions.
     */
    fun generate(
        compilationUnit: MidIrCompilationUnit,
        removeComments: Boolean = true
    ): AssemblyProgram {
        val instructions: MutableList<AssemblyInstruction> = mutableListOf()
        for (function in compilationUnit.functions) {
            generateInstructionsForFunction(function, instructions, removeComments)
        }
        return AssemblyProgram(globalVariables = compilationUnit.globalVariables, instructions = instructions)
    }

    private fun generateInstructionsForFunction(
        function: MidIrFunction,
        instructions: MutableList<AssemblyInstruction>,
        removeComments: Boolean
    ) {
        val functionName = function.functionName
        val statementsToTile = getStatementsToTile(function)
        instructions.add(LABEL(functionName))
        val context = FunctionContext()
        var tiledInstructions: List<AssemblyInstruction> = DpTiling(context, functionName).tile(statementsToTile)
        // simple optimizations
        tiledInstructions = SimpleOptimizations.optimizeAsm(tiledInstructions, removeComments)
        val registerAllocatedInstructions: List<AssemblyInstruction>
        val numberOfTemporariesOnStack: Int
        val allocator = RealRegisterAllocator(
            functionContext = context,
            hasReturn = function.hasReturn,
            tiledInstructions = tiledInstructions
        )
        registerAllocatedInstructions = allocator.realInstructions
        numberOfTemporariesOnStack = allocator.numberOfTemporariesOnStack
        val fixedInstructions = fixCallingConvention(
            functionName = functionName,
            numberOfTemporariesOnStack = numberOfTemporariesOnStack,
            mainFunctionBody = SimpleOptimizations.optimizeAsm(registerAllocatedInstructions, removeComments),
            removeComments = removeComments
        )
        instructions.addAll(fixedInstructions)
    }

    /**
     * @param argId the id of the argument, starting at 0.
     * @return the reg or mem place to fetch the argument inside a function.
     */
    private fun getArgPlaceInsideFunction(argId: Int): MidIrExpression =
        when (argId) {
            0 -> Temporary(RDI.id)
            1 -> Temporary(RSI.id)
            2 -> Temporary(RDX.id)
            3 -> Temporary(RCX.id)
            4 -> Temporary(R8.id)
            5 -> Temporary(R9.id)
            else -> {
                // -5 because -6 for reg arg place and +2 for the RIP and saved RBP.
                val offsetUnit = argId - 4
                val memExpr = MidIrExpression.Op(
                    operator = IrOperator.ADD,
                    e1 = Temporary(RBP.id),
                    e2 = MidIrExpression.Constant((8 * offsetUnit).toLong())
                )
                MidIrExpression.IMMUTABLE_MEM(expression = memExpr)
            }
        }

    /**
     * Obtain the statements to tile for a given IR function.
     * It's used to add move args instructions.
     *
     * @param f the function of interest.
     * @return the statements to tile for the function.
     */
    private fun getStatementsToTile(f: MidIrFunction): List<MidIrStatement> {
        val statementsToTile = mutableListOf<MidIrStatement>()
        val argsTemp = f.argumentTemps
        for (i in argsTemp.indices) {
            val argPlaceInIR = getArgPlaceInsideFunction(i)
            statementsToTile += MoveTemp(argsTemp[i].id, argPlaceInIR)
        }
        statementsToTile += f.mainBodyStatements
        return statementsToTile
    }

    /**
     * Generate prologue and epilogue of functions according System-V calling conventions.
     *
     * @param context calling convention context for function body.
     * @param numberOfTemporariesOnStack number of temporaries to spill onto the stack.
     * @param mainFunctionBody the not-yet-fixed main function body, generated during tiling.
     * @param removeComments whether to cleanup comments.
     */
    private fun fixCallingConvention(
        functionName: String,
        numberOfTemporariesOnStack: Int,
        mainFunctionBody: List<AssemblyInstruction>,
        removeComments: Boolean
    ): List<AssemblyInstruction> {
        val fixedInstructions = mutableListOf<AssemblyInstruction>()
        val isLeafFunction: Boolean = mainFunctionBody.none { it is AssemblyInstruction.CallAddress }
        if (!removeComments) {
            fixedInstructions += COMMENT(comment = "$functionName prologue starts")
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
            fixedInstructions += COMMENT(comment = "$functionName prologue ends")
        }
        // body
        fixedInstructions += mainFunctionBody
        if (!removeComments) {
            fixedInstructions += COMMENT(comment = "$functionName epilogue starts")
        }
        if (needToUseRBP) {
            fixedInstructions += MOVE(RSP, RBP)
            fixedInstructions += POP(RBP)
        }
        fixedInstructions += RET()
        if (!removeComments) {
            fixedInstructions += COMMENT(comment = "$functionName epilogue ends")
        }
        return fixedInstructions
    }
}
