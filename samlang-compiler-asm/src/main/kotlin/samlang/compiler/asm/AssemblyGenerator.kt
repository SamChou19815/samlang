package samlang.compiler.asm

import samlang.ast.asm.AssemblyArgs.R8
import samlang.ast.asm.AssemblyArgs.R9
import samlang.ast.asm.AssemblyArgs.RBP
import samlang.ast.asm.AssemblyArgs.RCX
import samlang.ast.asm.AssemblyArgs.RDI
import samlang.ast.asm.AssemblyArgs.RDX
import samlang.ast.asm.AssemblyArgs.RSI
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.Companion.LABEL
import samlang.ast.asm.AssemblyProgram
import samlang.compiler.asm.common.FunctionContext
import samlang.ast.common.IrOperator
import samlang.ast.mir.MidIrCompilationUnit
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrFunction
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.MoveTemp
import samlang.compiler.asm.common.CallingConventionFixer
import samlang.compiler.asm.ralloc.RealRegisterAllocator
import samlang.compiler.asm.tiling.DpTiling
import samlang.optimization.SimpleOptimizations

/** The assembly generator. */
@ExperimentalStdlibApi
class AssemblyGenerator private constructor(
    compilationUnit: MidIrCompilationUnit,
    private val removeComments: Boolean
) {
    private val publicFunctions: MutableList<String> = mutableListOf()
    private val instructions: MutableList<AssemblyInstruction> = mutableListOf()

    init {
        for (function in compilationUnit.functions) {
            generateInstructionsForFunction(function)
        }
    }

    private fun generateInstructionsForFunction(function: MidIrFunction) {
        val functionName = function.functionName
        publicFunctions += functionName
        val statementsToTile = getStatementsToTile(function)
        instructions.add(LABEL(functionName))
        val context = FunctionContext(
            functionName = functionName,
            hasReturn = function.hasReturn
        )
        var tiledInstructions: List<AssemblyInstruction> = DpTiling(context).tile(statementsToTile)
        // simple optimizations
        tiledInstructions = SimpleOptimizations.optimizeAsm(tiledInstructions, removeComments)
        val registerAllocatedInstructions: List<AssemblyInstruction>
        val numberOfTemporariesOnStack: Int
        val allocator = RealRegisterAllocator(
            functionContext = context,
            tiledInstructions = tiledInstructions
        )
        registerAllocatedInstructions = allocator.realInstructions
        numberOfTemporariesOnStack = allocator.numberOfTemporariesOnStack
        val fixedInstructions = CallingConventionFixer(
            context = context,
            numberOfTemporariesOnStack = numberOfTemporariesOnStack,
            mainFunctionBody = SimpleOptimizations.optimizeAsm(registerAllocatedInstructions, removeComments),
            removeComments = removeComments
        ).bodyWithCorrectCallingConvention
        instructions.addAll(fixedInstructions)
    }

    companion object {
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
            val generator = AssemblyGenerator(compilationUnit = compilationUnit, removeComments = removeComments)
            return AssemblyProgram(
                globalVariables = compilationUnit.globalVariables,
                instructions = generator.instructions
            )
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
    }
}
