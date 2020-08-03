package samlang.compiler.asm.tiling

import samlang.ast.asm.AssemblyArgs.REG
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.Companion.COMMENT
import samlang.ast.asm.AssemblyInstruction.Companion.NEG
import samlang.ast.common.IrOperator
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Companion.MINUS_ONE
import samlang.ast.mir.MidIrExpression.Companion.TEMP
import samlang.ast.mir.MidIrExpression.Companion.ZERO
import samlang.ast.mir.MidIrStatement.MoveMem
import samlang.ast.mir.MidIrStatement.MoveTemp

/** A collection of tiling for the neg instructions. */
internal object TileNeg {
    private fun opIsForNeg(source: MidIrExpression.Op, dest: MidIrExpression): Boolean {
        // the case for 0 - x
        if (source.operator === IrOperator.SUB && source.e1 == ZERO && source.e2 == dest) {
            return true
        }
        // the case for (-1) * x or x * (-1)
        return if (source.operator !== IrOperator.MUL) {
            false
        } else {
            source.e1 == dest && source.e2 == MINUS_ONE || source.e2 == dest && source.e1 == MINUS_ONE
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
                                NEG(REG(node.tempId))
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
                instructions += NEG(mem)
                return StatementTilingResult(instructions)
            }
            return null
        }
    }
}
