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
import samlang.ast.mir.MidIrExpression.Op
import samlang.ast.mir.MidIrOperator

/**
 * A generic tiling of op expression.
 */
internal object TileGenericOp : IrExpressionTile<Op> {
    override fun getTilingResult(node: Op, dpTiling: DpTiling): ExpressionTilingResult {
        val instructions = mutableListOf<AssemblyInstruction>()
        val resultReg = dpTiling.context.nextReg()
        val (instructions1, e1Reg) = dpTiling.tile(node.e1)
        val e2Result = when (node.operator) {
            MidIrOperator.LT, MidIrOperator.LE, MidIrOperator.GT,
            MidIrOperator.GE, MidIrOperator.EQ, MidIrOperator.NE -> dpTiling.tile(node.e2)
            else -> dpTiling.tileRegOrMem(node.e2)
        }
        instructions += COMMENT("TileGenericOp: $node")
        instructions.addAll(instructions1)
        instructions.addAll(e2Result.instructions)
        val e2RegOrMem = e2Result.regOrMem
        when (node.operator) {
            MidIrOperator.ADD -> {
                instructions += MOVE(resultReg, e1Reg)
                instructions += BIN_OP(AlBinaryOpType.ADD, resultReg, e2RegOrMem)
            }
            MidIrOperator.SUB -> {
                instructions += MOVE(resultReg, e1Reg)
                instructions += BIN_OP(AlBinaryOpType.SUB, resultReg, e2RegOrMem)
            }
            MidIrOperator.MUL -> {
                instructions += MOVE(resultReg, e1Reg)
                instructions += IMUL(resultReg, e2RegOrMem)
            }
            MidIrOperator.DIV -> {
                instructions += MOVE(RAX, e1Reg)
                instructions += CQO()
                instructions += IDIV(e2RegOrMem)
                instructions += MOVE(resultReg, RAX)
            }
            MidIrOperator.MOD -> {
                instructions += MOVE(RAX, e1Reg)
                instructions += CQO()
                instructions += IDIV(e2RegOrMem)
                instructions += MOVE(resultReg, RDX)
            }
            MidIrOperator.LT -> {
                instructions += CMP(e1Reg, e2RegOrMem as Reg)
                instructions += SET(JumpType.JL, RAX)
                instructions += MOVE(resultReg, RAX)
            }
            MidIrOperator.LE -> {
                instructions += CMP(e1Reg, e2RegOrMem as Reg)
                instructions += SET(JumpType.JLE, RAX)
                instructions += MOVE(resultReg, RAX)
            }
            MidIrOperator.GT -> {
                instructions += CMP(e1Reg, e2RegOrMem as Reg)
                instructions += SET(JumpType.JG, RAX)
                instructions += MOVE(resultReg, RAX)
            }
            MidIrOperator.GE -> {
                instructions += CMP(e1Reg, e2RegOrMem as Reg)
                instructions += SET(JumpType.JGE, RAX)
                instructions += MOVE(resultReg, RAX)
            }
            MidIrOperator.EQ -> {
                instructions += CMP(e1Reg, e2RegOrMem as Reg)
                instructions += SET(JumpType.JE, RAX)
                instructions += MOVE(resultReg, RAX)
            }
            MidIrOperator.NE -> {
                instructions += CMP(e1Reg, e2RegOrMem as Reg)
                instructions += SET(JumpType.JNE, RAX)
                instructions += MOVE(resultReg, RAX)
            }
            MidIrOperator.OR -> {
                instructions += MOVE(resultReg, e1Reg)
                instructions += BIN_OP(AlBinaryOpType.OR, resultReg, e2RegOrMem)
            }
            MidIrOperator.AND -> {
                instructions += MOVE(resultReg, e1Reg)
                instructions += BIN_OP(AlBinaryOpType.AND, resultReg, e2RegOrMem)
            }
            MidIrOperator.XOR -> {
                instructions += MOVE(resultReg, e1Reg)
                instructions += BIN_OP(AlBinaryOpType.XOR, resultReg, e2RegOrMem)
            }
        }
        return ExpressionTilingResult(instructions, resultReg)
    }
}
