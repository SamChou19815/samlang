package samlang.compiler.asm.tiling

import samlang.ast.asm.AssemblyArg
import samlang.ast.asm.AssemblyArgs.REG
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.Companion.MOVE
import samlang.ast.asm.AssemblyInstruction.Companion.SHIFT
import samlang.ast.asm.AssemblyInstruction.ShiftType
import samlang.ast.asm.RegOrMem
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Constant
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrOperator
import samlang.ast.mir.MidIrStatement.MoveMem
import samlang.ast.mir.MidIrStatement.MoveTemp
import samlang.compiler.asm.common.MiscUtil

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
            if (e2 is Constant && MiscUtil.isPowerOfTwo(e2.value)) {
                if (e1 == destExpr) {
                    MiscUtil.logTwo(e2.value)
                } else {
                    null
                }
            } else if (e1 is Constant && MiscUtil.isPowerOfTwo(e1.value)) {
                if (e2 == destExpr) {
                    MiscUtil.logTwo(e1.value)
                } else {
                    null
                }
            } else {
                null
            }
        } else {
            val shiftCount: Int
            val argToShift: AssemblyArg
            if (e2 is Constant && MiscUtil.isPowerOfTwo(e2.value)) {
                val e1Result = dpTiling.tileArg(e1)
                argToShift = e1Result.arg
                shiftCount = MiscUtil.logTwo(e2.value)
                instructions.addAll(e1Result.instructions)
            } else if (e1 is Constant && MiscUtil.isPowerOfTwo(e1.value)) {
                val e2Result = dpTiling.tileArg(e2)
                argToShift = e2Result.arg
                shiftCount = MiscUtil.logTwo(e1.value)
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
        val instructions = arrayListOf<AssemblyInstruction>()
        val e1 = node.e1
        val e2 = node.e2
        return when (node.operator) {
            MidIrOperator.MUL -> {
                val shiftCount = trySetupAndFindShiftAmount(
                        instructions, e1, e2, destExpr, resultPlace, dpTiling
                ) ?: return null
                instructions += SHIFT(ShiftType.SHL, resultPlace, shiftCount)
                instructions
            }
            else -> null
        }
    }

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
            val dest = MidIrExpression.Mem(node.memLocation)
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
