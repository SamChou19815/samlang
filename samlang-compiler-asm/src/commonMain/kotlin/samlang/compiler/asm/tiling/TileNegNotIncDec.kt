package samlang.compiler.asm.tiling

import samlang.ast.asm.AssemblyArgs.REG
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.AlUnaryOpType
import samlang.ast.asm.AssemblyInstruction.Companion.COMMENT
import samlang.ast.asm.AssemblyInstruction.Companion.UN_OP
import samlang.ast.common.IrOperator
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Companion.MINUS_ONE
import samlang.ast.mir.MidIrExpression.Companion.ONE
import samlang.ast.mir.MidIrExpression.Companion.TEMP
import samlang.ast.mir.MidIrExpression.Companion.ZERO
import samlang.ast.mir.MidIrStatement.MoveMem
import samlang.ast.mir.MidIrStatement.MoveTemp

/**
 * A collection of tiling for the neg/not/inc/dec instructions.
 */
internal object TileNegNotIncDec {
    private fun opIsForInc(source: MidIrExpression.Op, dest: MidIrExpression): Boolean {
        if (source.operator !== IrOperator.ADD) {
            return false
        }
        val opE1 = source.e1
        val opE2 = source.e2
        return opE1 == dest && opE2 == ONE || opE2 == dest && opE1 == ONE
    }

    private fun opIsForDec(source: MidIrExpression.Op, dest: MidIrExpression): Boolean {
        val op = source.operator
        return if (op === IrOperator.ADD) {
            source.e2 == dest && source.e1 == MINUS_ONE ||
                    source.e1 == dest && source.e2 == MINUS_ONE
        } else {
            op === IrOperator.SUB && source.e1 == dest && source.e2 == ONE
        }
    }

    private fun opIsForNeg(source: MidIrExpression.Op, dest: MidIrExpression): Boolean {
        // the case for 0 - x
        if (source.operator === IrOperator.SUB && source.e1 == ZERO && source.e2 == dest) {
            return true
        }
        // the case for (-1) * x or x * (-1)
        return if (source.operator !== IrOperator.MUL) {
            false
        } else {
            source.e1 == dest && source.e2 == MINUS_ONE ||
                    source.e2 == dest && source.e1 == MINUS_ONE
        }
    }

    object IncForMoveTemp : IrStatementTile<MoveTemp> {
        override fun getTilingResult(node: MoveTemp, dpTiling: DpTiling): StatementTilingResult? {
            val source = node.source as? MidIrExpression.Op ?: return null
            val destIrTemp = TEMP(node.tempId)
            if (opIsForInc(source, destIrTemp)) {
                val regToChange = REG(node.tempId)
                return StatementTilingResult(
                        listOf(
                                COMMENT(node),
                                UN_OP(AlUnaryOpType.INC, regToChange)
                        )
                )
            }
            return null
        }
    }

    object IncForMoveMem : IrStatementTile<MoveMem> {
        override fun getTilingResult(node: MoveMem, dpTiling: DpTiling): StatementTilingResult? {
            val source = node.source as? MidIrExpression.Op ?: return null
            val destIrMem = MidIrExpression.IMMUTABLE_MEM(expression = node.memLocation)
            if (opIsForInc(source, destIrMem)) {
                val (instructions1, memToChange) = MemTilingHelper.tileMem(destIrMem, dpTiling)
                val instructions = mutableListOf<AssemblyInstruction>()
                instructions += COMMENT(node)
                instructions += instructions1
                instructions += UN_OP(AlUnaryOpType.INC, memToChange)
                return StatementTilingResult(instructions)
            }
            return null
        }
    }

    object DecForMoveTemp : IrStatementTile<MoveTemp> {
        override fun getTilingResult(node: MoveTemp, dpTiling: DpTiling): StatementTilingResult? {
            val source = node.source as? MidIrExpression.Op ?: return null
            val destIrTemp = TEMP(node.tempId)
            return if (opIsForDec(source, destIrTemp)) {
                StatementTilingResult(
                        listOf(
                                COMMENT(node),
                                UN_OP(AlUnaryOpType.DEC, REG(node.tempId))
                        )
                )
            } else {
                null
            }
        }
    }

    object DecForMoveMem : IrStatementTile<MoveMem> {
        override fun getTilingResult(node: MoveMem, dpTiling: DpTiling): StatementTilingResult? {
            val source = node.source as? MidIrExpression.Op ?: return null
            val destIrMem = MidIrExpression.IMMUTABLE_MEM(expression = node.memLocation)
            if (opIsForDec(source, destIrMem)) {
                val (instructions1, mem) = MemTilingHelper.tileMem(destIrMem, dpTiling)
                val instructions = mutableListOf<AssemblyInstruction>()
                instructions += COMMENT(node)
                instructions += instructions1
                instructions += UN_OP(AlUnaryOpType.DEC, mem)
                return StatementTilingResult(instructions)
            }
            return null
        }
    }

    object NegForMoveTemp : IrStatementTile<MoveTemp> {
        override fun getTilingResult(node: MoveTemp, dpTiling: DpTiling): StatementTilingResult? {
            val source = node.source as? MidIrExpression.Op ?: return null
            val destIrTemp = TEMP(node.tempId)
            return if (opIsForNeg(source, destIrTemp)) {
                StatementTilingResult(
                        listOf(
                                COMMENT(node),
                                UN_OP(AlUnaryOpType.NEG, REG(node.tempId))
                        )
                )
            } else null
        }
    }

    object NegForMoveMem : IrStatementTile<MoveMem> {
        override fun getTilingResult(node: MoveMem, dpTiling: DpTiling): StatementTilingResult? {
            val source = node.source as? MidIrExpression.Op ?: return null
            val destIrMem = MidIrExpression.IMMUTABLE_MEM(expression = node.memLocation)
            if (opIsForNeg(source, destIrMem)) {
                val (instructions1, mem) = MemTilingHelper.tileMem(destIrMem, dpTiling)
                val instructions = mutableListOf<AssemblyInstruction>()
                instructions += COMMENT(node)
                instructions += instructions1
                instructions += UN_OP(AlUnaryOpType.NEG, mem)
                return StatementTilingResult(instructions)
            }
            return null
        }
    }
}
