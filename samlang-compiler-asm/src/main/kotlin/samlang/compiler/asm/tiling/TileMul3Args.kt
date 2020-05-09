package samlang.compiler.asm.tiling

import samlang.ast.asm.AssemblyArgs
import samlang.ast.asm.AssemblyArgs.CONST
import samlang.ast.asm.AssemblyArgs.REG
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.Companion.COMMENT
import samlang.ast.asm.AssemblyInstruction.Companion.IMUL
import samlang.ast.asm.AssemblyInstruction.Companion.MOVE
import samlang.ast.asm.RegOrMem
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Constant
import samlang.ast.mir.MidIrExpression.Op
import samlang.ast.mir.MidIrOperator
import samlang.ast.mir.MidIrStatement.MoveMem
import samlang.ast.mir.MidIrStatement.MoveTemp

/**
 * The tiles for 3-arg form of imul for ops and move.
 */
@Suppress(names = ["DuplicatedCode"])
internal object TileMul3Args {
    private fun tryToTile(dpTiling: DpTiling, src: MidIrExpression): Result? {
        if (src !is Op) {
            return null
        }
        val (operator, e1, e2) = src
        if (operator !== MidIrOperator.MUL) {
            return null
        }
        if (e1 is Constant) {
            try {
                val intValue = Math.toIntExact(e1.value)
                val tilingResult = dpTiling.tileRegOrMem(e2)
                return Result(
                        instructions = tilingResult.instructions,
                        op1 = tilingResult.regOrMem,
                        op2 = CONST(value = intValue)
                )
            } catch (_: ArithmeticException) {
                // do nothing
            }
        }
        if (e2 is Constant) {
            try {
                val intValue = Math.toIntExact(e2.value)
                val tilingResult = dpTiling.tileRegOrMem(e1)
                return Result(
                        instructions = tilingResult.instructions,
                        op1 = tilingResult.regOrMem,
                        op2 = CONST(value = intValue)
                )
            } catch (_: ArithmeticException) {
                // do nothing
            }
        }
        return null
    }

    private data class Result(
        val instructions: List<AssemblyInstruction>,
        val op1: RegOrMem,
        val op2: AssemblyArgs.Const
    )

    object ForMoveTemp : IrStatementTile<MoveTemp> {
        override fun getTilingResult(node: MoveTemp, dpTiling: DpTiling): StatementTilingResult? {
            val result = tryToTile(dpTiling, node.source) ?: return null
            val instructions = mutableListOf<AssemblyInstruction>()
            instructions += COMMENT(comment = "TileMul3ArgsForMove: $node")
            instructions += result.instructions
            instructions += IMUL(REG(node.tempId), result.op1, result.op2)
            return StatementTilingResult(instructions)
        }
    }

    object ForMoveMem : IrStatementTile<MoveMem> {
        override fun getTilingResult(node: MoveMem, dpTiling: DpTiling): StatementTilingResult? {
            val result = tryToTile(dpTiling, node.source) ?: return null
            val instructions = mutableListOf<AssemblyInstruction>()
            instructions += COMMENT(comment = "TileMul3ArgsForMove: $node")
            instructions += result.instructions
            val (instructions1, mem) = MemTilingHelper.tileMem(MidIrExpression.Mem(node.memLocation), dpTiling)
            instructions += instructions1
            val tempRegForMulResult = dpTiling.context.nextReg()
            instructions += IMUL(tempRegForMulResult, result.op1, result.op2)
            instructions += MOVE(mem, tempRegForMulResult)
            return StatementTilingResult(instructions)
        }
    }

    object ForOp : IrExpressionTile<Op> {
        override fun getTilingResult(node: Op, dpTiling: DpTiling): ExpressionTilingResult? {
            val result = tryToTile(dpTiling, node) ?: return null
            val resultReg = dpTiling.context.nextReg()
            val instructions = mutableListOf<AssemblyInstruction>()
            instructions += COMMENT(comment = "TileMul3ArgsForOp: $node")
            instructions += result.instructions
            instructions += IMUL(resultReg, result.op1, result.op2)
            return ExpressionTilingResult(instructions, resultReg)
        }
    }
}
