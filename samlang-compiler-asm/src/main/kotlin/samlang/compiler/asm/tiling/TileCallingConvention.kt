package samlang.compiler.asm.tiling

import kotlin.math.max
import samlang.ast.asm.AssemblyArg
import samlang.ast.asm.AssemblyArgs.CONST
import samlang.ast.asm.AssemblyArgs.NAME
import samlang.ast.asm.AssemblyArgs.R8
import samlang.ast.asm.AssemblyArgs.R9
import samlang.ast.asm.AssemblyArgs.RAX
import samlang.ast.asm.AssemblyArgs.RCX
import samlang.ast.asm.AssemblyArgs.RDI
import samlang.ast.asm.AssemblyArgs.RDX
import samlang.ast.asm.AssemblyArgs.REG
import samlang.ast.asm.AssemblyArgs.RSI
import samlang.ast.asm.AssemblyArgs.RSP
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.AlBinaryOpType
import samlang.ast.asm.AssemblyInstruction.AlBinaryOpType.ADD
import samlang.ast.asm.AssemblyInstruction.Companion.BIN_OP
import samlang.ast.asm.AssemblyInstruction.Companion.CALL
import samlang.ast.asm.AssemblyInstruction.Companion.COMMENT
import samlang.ast.asm.AssemblyInstruction.Companion.MOVE
import samlang.ast.asm.AssemblyInstruction.Companion.PUSH
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrStatement.CallFunction
import samlang.ast.mir.MidIrStatement.Return

/**
 * The tiles where we need to deal with calling conventions.
 * It's one central place where we get many calling convention computation done.
 */
internal object TileCallingConvention {
    object CallTiler : IrStatementTile<CallFunction> {
        override fun getTilingResult(node: CallFunction, dpTiling: DpTiling): StatementTilingResult {
            val functionExpr = node.functionExpr
            val instructions = mutableListOf<AssemblyInstruction>()
            instructions += COMMENT(node)
            // preparation: we till the function.
            val irFunctionExpr = node.functionExpr
            val asmFunctionExpr: AssemblyArg
            asmFunctionExpr = if (irFunctionExpr is MidIrExpression.Name) {
                NAME(irFunctionExpr.name)
            } else {
                val functionExprTilingResult = dpTiling.tileArg(irFunctionExpr)
                instructions += functionExprTilingResult.instructions
                functionExprTilingResult.arg
            }
            // preparation: we till all the arguments.
            val args = mutableListOf<AssemblyArg>()
            for (irArg in node.arguments) {
                val tilingResult = dpTiling.tileArg(irArg)
                instructions += tilingResult.instructions
                args += tilingResult.arg
            }
            // preparation: we prepare slots to put the return values.
            val resultReg = node.returnCollector?.let { REG(it.id) }
            // compute the extra space we need.
            val extraArgUnit = max(a = args.size - 6, b = 0)
            val totalScratchSpace = extraArgUnit + 0
            instructions += COMMENT(comment = "We are about to call $functionExpr")
            // setup scratch space for args and return values, also prepare space for 16b alignment.
            if (totalScratchSpace > 0) {
                // we ensure we will eventually push down x units, where x is divisible by 2.
                val offset = if (totalScratchSpace % 2 == 0) 0 else 1
                instructions += BIN_OP(AlBinaryOpType.SUB, RSP, CONST(value = 8 * offset))
            }
            // setup arguments and setup scratch space for arg passing
            for (i in args.indices.reversed()) {
                val arg = args[i]
                when (i) {
                    0 -> instructions += MOVE(RDI, arg)
                    1 -> instructions += MOVE(RSI, arg)
                    2 -> instructions += MOVE(RDX, arg)
                    3 -> instructions += MOVE(RCX, arg)
                    4 -> instructions += MOVE(R8, arg)
                    5 -> instructions += MOVE(R9, arg)
                    else -> instructions += PUSH(arg)
                }
            }
            instructions += CALL(asmFunctionExpr)
            // get return values back
            if (resultReg != null) {
                instructions += MOVE(resultReg, RAX)
            }
            if (totalScratchSpace > 0) { // move the stack up again
                instructions += BIN_OP(ADD, RSP, CONST(value = 8 * totalScratchSpace))
            }
            instructions += COMMENT(comment = "We finished calling $functionExpr")
            return StatementTilingResult(instructions)
        }
    }

    object ReturnTiler : IrStatementTile<Return> {
        override fun getTilingResult(node: Return, dpTiling: DpTiling): StatementTilingResult {
            val instructions = mutableListOf<AssemblyInstruction>()
            instructions += COMMENT(node)
            val returnedExpression = node.returnedExpression
            val context = dpTiling.context
            // move the stuff into the return position.
            if (returnedExpression != null) {
                val (returnedExpressionInstructions, resultReg) = dpTiling.tile(returnedExpression)
                instructions += returnedExpressionInstructions
                instructions += MOVE(RAX, resultReg)
            }
            // jump to the end of functions body / start of epilogue
            instructions += context.jumpToFunctionCallEpilogue
            return StatementTilingResult(instructions)
        }
    }
}
