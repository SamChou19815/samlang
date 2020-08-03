package samlang.compiler.asm.tiling

import samlang.ast.asm.AssemblyArgs.RAX
import samlang.ast.asm.AssemblyArgs.RDX
import samlang.ast.asm.AssemblyArgs.Reg
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.AlBinaryOpType
import samlang.ast.asm.AssemblyInstruction.Companion.BIN_OP
import samlang.ast.asm.AssemblyInstruction.Companion.CMP
import samlang.ast.asm.AssemblyInstruction.Companion.COMMENT
import samlang.ast.asm.AssemblyInstruction.Companion.CQO
import samlang.ast.asm.AssemblyInstruction.Companion.IDIV
import samlang.ast.asm.AssemblyInstruction.Companion.IMUL
import samlang.ast.asm.AssemblyInstruction.Companion.MOVE
import samlang.ast.asm.AssemblyInstruction.Companion.SET
import samlang.ast.asm.AssemblyInstruction.JumpType
import samlang.ast.common.IrOperator
import samlang.ast.mir.MidIrExpression.Op

/**
 * A generic tiling of op expression.
 */
internal object TileGenericOp : IrExpressionTile<Op> {
    override fun getTilingResult(node: Op, dpTiling: DpTiling): ExpressionTilingResult {
        val instructions = mutableListOf<AssemblyInstruction>()
        val resultReg = dpTiling.context.nextReg()
        val (instructions1, e1Reg) = dpTiling.tile(node.e1)
        val e2Result = when (node.operator) {
            IrOperator.LT, IrOperator.LE, IrOperator.GT,
            IrOperator.GE, IrOperator.EQ, IrOperator.NE -> dpTiling.tile(node.e2)
            else -> dpTiling.tileRegOrMem(node.e2)
        }
        instructions += COMMENT("TileGenericOp: $node")
        instructions.addAll(instructions1)
        instructions.addAll(e2Result.instructions)
        val e2RegOrMem = e2Result.regOrMem
        when (node.operator) {
            IrOperator.ADD -> {
                instructions += MOVE(resultReg, e1Reg)
                instructions += BIN_OP(AlBinaryOpType.ADD, resultReg, e2RegOrMem)
            }
            IrOperator.SUB -> {
                instructions += MOVE(resultReg, e1Reg)
                instructions += BIN_OP(AlBinaryOpType.SUB, resultReg, e2RegOrMem)
            }
            IrOperator.MUL -> {
                instructions += MOVE(resultReg, e1Reg)
                instructions += IMUL(resultReg, e2RegOrMem)
            }
            IrOperator.DIV -> {
                instructions += MOVE(RAX, e1Reg)
                instructions += CQO()
                instructions += IDIV(e2RegOrMem)
                instructions += MOVE(resultReg, RAX)
            }
            IrOperator.MOD -> {
                instructions += MOVE(RAX, e1Reg)
                instructions += CQO()
                instructions += IDIV(e2RegOrMem)
                instructions += MOVE(resultReg, RDX)
            }
            IrOperator.LT -> {
                instructions += CMP(e1Reg, e2RegOrMem as Reg)
                instructions += SET(JumpType.JL, RAX)
                instructions += MOVE(resultReg, RAX)
            }
            IrOperator.LE -> {
                instructions += CMP(e1Reg, e2RegOrMem as Reg)
                instructions += SET(JumpType.JLE, RAX)
                instructions += MOVE(resultReg, RAX)
            }
            IrOperator.GT -> {
                instructions += CMP(e1Reg, e2RegOrMem as Reg)
                instructions += SET(JumpType.JG, RAX)
                instructions += MOVE(resultReg, RAX)
            }
            IrOperator.GE -> {
                instructions += CMP(e1Reg, e2RegOrMem as Reg)
                instructions += SET(JumpType.JGE, RAX)
                instructions += MOVE(resultReg, RAX)
            }
            IrOperator.EQ -> {
                instructions += CMP(e1Reg, e2RegOrMem as Reg)
                instructions += SET(JumpType.JE, RAX)
                instructions += MOVE(resultReg, RAX)
            }
            IrOperator.NE -> {
                instructions += CMP(e1Reg, e2RegOrMem as Reg)
                instructions += SET(JumpType.JNE, RAX)
                instructions += MOVE(resultReg, RAX)
            }
            IrOperator.XOR -> {
                instructions += MOVE(resultReg, e1Reg)
                instructions += BIN_OP(AlBinaryOpType.XOR, resultReg, e2RegOrMem)
            }
        }
        return ExpressionTilingResult(instructions, resultReg)
    }
}
