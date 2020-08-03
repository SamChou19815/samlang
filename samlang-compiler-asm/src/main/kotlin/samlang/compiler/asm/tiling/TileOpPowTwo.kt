package samlang.compiler.asm.tiling

import samlang.ast.asm.AssemblyArg
import samlang.ast.asm.AssemblyArgs.REG
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.Companion.MOVE
import samlang.ast.asm.AssemblyInstruction.Companion.SHL
import samlang.ast.asm.RegOrMem
import samlang.ast.common.IrOperator
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Constant
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrStatement.MoveMem
import samlang.ast.mir.MidIrStatement.MoveTemp

/**
 * A collection of tiling for operations with a power of 2
 */
internal object TileOpPowTwo {
    private fun addMove(
        dest: RegOrMem,
        src: AssemblyArg,
        dpTiling: DpTiling,
        instructions: MutableList<AssemblyInstruction>
    ) {
        dest.matchRegOrMem(
                regF = { regDest -> instructions.add(MOVE(regDest, src)) },
                memF = { memDest ->
                    src.matchConstVsRegOrMem<Unit>(
                            constF = { constOrRegSrc -> instructions.add(MOVE(memDest, constOrRegSrc)) },
                            regOrMemF = { memSrc ->
                                val tempReg = dpTiling.context.nextReg()
                                instructions.add(MOVE(tempReg, memSrc))
                                instructions.add(MOVE(memDest, tempReg))
                            }
                    )
                }
        )
    }

    /**
     * A function that tries to setup for the shift tiling.
     *
     * @param instructions the list of instructions to append additional instructions for shifting.
     * @param e1 the first operand to inspect and potentially extract shift amount.
     * @param e2 the second operand to inspect and potentially extract shift amount.
     * @param destExpr the optional destination expression used to check whether src and dest are
     * the same. If it is given, then the resultReg is used to check whether one of the operand is
     * the same as the result register.
     * @param resultPlace the optional place to put the result in.
     * @param dpTiling the tiling class.
     * @return the computed shift amount, or null if it cannot be tiled in this way.
     */
    private fun trySetupAndFindShiftAmount(
        instructions: MutableList<AssemblyInstruction>,
        e1: MidIrExpression,
        e2: MidIrExpression,
        destExpr: MidIrExpression?,
        resultPlace: RegOrMem,
        dpTiling: DpTiling
    ): Int? {
        return if (destExpr != null) {
            if (e2 is Constant && isPowerOfTwo(e2.value)) {
                if (e1 == destExpr) {
                    logTwo(e2.value)
                } else {
                    null
                }
            } else if (e1 is Constant && isPowerOfTwo(e1.value)) {
                if (e2 == destExpr) {
                    logTwo(e1.value)
                } else {
                    null
                }
            } else {
                null
            }
        } else {
            val shiftCount: Int
            val argToShift: AssemblyArg
            if (e2 is Constant && isPowerOfTwo(e2.value)) {
                val e1Result = dpTiling.tileArg(e1)
                argToShift = e1Result.arg
                shiftCount = logTwo(e2.value)
                instructions.addAll(e1Result.instructions)
            } else if (e1 is Constant && isPowerOfTwo(e1.value)) {
                val e2Result = dpTiling.tileArg(e2)
                argToShift = e2Result.arg
                shiftCount = logTwo(e1.value)
                instructions.addAll(e2Result.instructions)
            } else {
                return null
            }
            addMove(resultPlace, argToShift, dpTiling, instructions)
            shiftCount
        }
    }

    /**
     * @param node the op node to tile.
     * @param destExpr the optional destination expression used to check whether src and dest are
     * the same. If it is given, then the resultReg is used to check whether one of the operand is
     * the same as the result register.
     * @param resultPlace the place used to put the result.
     * @param dpTiling the tiling class.
     * @return the instructions to run, or null if it cannot be tiled in this way.
     */
    private fun tileOp(
        node: MidIrExpression.Op,
        destExpr: MidIrExpression?,
        resultPlace: RegOrMem,
        dpTiling: DpTiling
    ): List<AssemblyInstruction>? {
        val instructions = mutableListOf<AssemblyInstruction>()
        val e1 = node.e1
        val e2 = node.e2
        return when (node.operator) {
            IrOperator.MUL -> {
                val shiftCount = trySetupAndFindShiftAmount(
                        instructions, e1, e2, destExpr, resultPlace, dpTiling
                ) ?: return null
                instructions += SHL(resultPlace, shiftCount)
                instructions
            }
            else -> null
        }
    }

    private fun logTwo(num: Long): Int = if (num == 1L) 0 else 1 + logTwo(num = num / 2)

    private fun isPowerOfTwo(num: Long): Boolean = num > 0 && num and num - 1 == 0L

    object ForMoveTemp : IrStatementTile<MoveTemp> {
        override fun getTilingResult(node: MoveTemp, dpTiling: DpTiling): StatementTilingResult? {
            val src = node.source as? MidIrExpression.Op ?: return null
            val dest = Temporary(node.tempId)
            val resultPlace = REG(node.tempId)
            val instructions =
                    tileOp(src, dest, resultPlace, dpTiling)
            return instructions?.let { StatementTilingResult(it) }
        }
    }

    object ForMoveMem : IrStatementTile<MoveMem> {
        override fun getTilingResult(node: MoveMem, dpTiling: DpTiling): StatementTilingResult? {
            val src = node.source as? MidIrExpression.Op ?: return null
            val dest = MidIrExpression.IMMUTABLE_MEM(expression = node.memLocation)
            val (instructions1, mem) = MemTilingHelper.tileMem(dest, dpTiling)
            val instructions = instructions1.toMutableList()
            val shiftInstructions = tileOp(src, dest, mem, dpTiling) ?: return null
            instructions.addAll(shiftInstructions)
            return StatementTilingResult(instructions)
        }
    }

    object ForOp : IrExpressionTile<MidIrExpression.Op> {
        override fun getTilingResult(
            node: MidIrExpression.Op,
            dpTiling: DpTiling
        ): ExpressionTilingResult? {
            val resultReg = dpTiling.context.nextReg()
            val instructions = tileOp(
                    node = node,
                    destExpr = null,
                    resultPlace = resultReg,
                    dpTiling = dpTiling
            ) ?: return null
            return ExpressionTilingResult(instructions, resultReg)
        }
    }
}
