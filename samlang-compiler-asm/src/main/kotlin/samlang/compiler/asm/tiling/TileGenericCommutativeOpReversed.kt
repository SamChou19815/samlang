package samlang.compiler.asm.tiling

import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.AlBinaryOpType
import samlang.ast.asm.AssemblyInstruction.Companion.BIN_OP
import samlang.ast.asm.AssemblyInstruction.Companion.COMMENT
import samlang.ast.asm.AssemblyInstruction.Companion.IMUL
import samlang.ast.asm.AssemblyInstruction.Companion.MOVE
import samlang.ast.common.IrOperator
import samlang.ast.mir.MidIrExpression.Op

/**
 * A generic tiling of commutative op expression, but in reverse order.
 * It's a complement for TileGenericOp
 */
internal object TileGenericCommutativeOpReversed : IrExpressionTile<Op> {
    override fun getTilingResult(node: Op, dpTiling: DpTiling): ExpressionTilingResult? {
        val instructions = mutableListOf<AssemblyInstruction>()
        val resultReg = dpTiling.context.nextReg()
        val (instructions1, e2Reg) = dpTiling.tile(node.e2)
        val e1Result: RegOrMemTilingResult = when (node.operator) {
            IrOperator.SUB, IrOperator.DIV, IrOperator.MOD,
            IrOperator.LT, IrOperator.LE, IrOperator.GT,
            IrOperator.GE, IrOperator.EQ, IrOperator.NE -> return null
            else -> dpTiling.tileRegOrMem(node.e1)
        }
        instructions += COMMENT(comment = "TileGenericOp: $node")
        instructions += e1Result.instructions
        instructions += instructions1
        val e1RegOrMem = e1Result.regOrMem
        when (node.operator) {
            IrOperator.ADD -> {
                instructions += MOVE(resultReg, e2Reg)
                instructions += BIN_OP(AlBinaryOpType.ADD, resultReg, e1RegOrMem)
            }
            IrOperator.MUL -> {
                instructions += MOVE(resultReg, e2Reg)
                instructions += IMUL(resultReg, e1RegOrMem)
            }
            IrOperator.XOR -> {
                instructions += MOVE(resultReg, e2Reg)
                instructions += BIN_OP(AlBinaryOpType.XOR, resultReg, e1RegOrMem)
            }
            else -> throw Error()
        }
        return ExpressionTilingResult(instructions, resultReg)
    }
}
