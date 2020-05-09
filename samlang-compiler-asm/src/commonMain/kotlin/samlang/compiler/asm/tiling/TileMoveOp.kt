package samlang.compiler.asm.tiling

import samlang.ast.asm.AssemblyArgs
import samlang.ast.asm.AssemblyArgs.REG
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.AlBinaryOpType
import samlang.ast.asm.AssemblyInstruction.Companion.BIN_OP
import samlang.ast.asm.AssemblyInstruction.Companion.COMMENT
import samlang.ast.asm.AssemblyInstruction.Companion.IMUL
import samlang.ast.asm.AssemblyInstruction.Companion.LEA
import samlang.ast.asm.AssemblyInstruction.Companion.MOVE
import samlang.ast.asm.RegOrMem
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Companion.TEMP
import samlang.ast.mir.MidIrOperator
import samlang.ast.mir.MidIrStatement.MoveMem
import samlang.ast.mir.MidIrStatement.MoveTemp

/**
 * A collection of tiling for the move op where the source is an op expression that contains the mem
 * in dest.
 */
internal object TileMoveOp {
    object LeaForMoveTemp : IrStatementTile<MoveTemp> {
        override fun getTilingResult(node: MoveTemp, dpTiling: DpTiling): StatementTilingResult? {
            // try to use LEA if we can
            val (instructions1, mem) = MemTilingHelper.tileExprForMem(node.source, dpTiling)
                    ?: return null
            val instructions = mutableListOf<AssemblyInstruction>()
            instructions += COMMENT(comment = "TileMoveOpByLEA: $node")
            instructions += instructions1
            instructions += LEA(REG(node.tempId), mem)
            return StatementTilingResult(instructions)
        }
    }

    object CommutativeOpForMoveTemp : IrStatementTile<MoveTemp> {
        override fun getTilingResult(node: MoveTemp, dpTiling: DpTiling): StatementTilingResult? {
            val source = node.source as? MidIrExpression.Op ?: return null
            val (operator, e1, e2) = source
            val opType: AlBinaryOpType?
            opType = when (operator) {
                MidIrOperator.ADD -> AlBinaryOpType.ADD
                MidIrOperator.MUL -> null
                MidIrOperator.AND -> AlBinaryOpType.AND
                MidIrOperator.OR -> AlBinaryOpType.OR
                MidIrOperator.XOR -> AlBinaryOpType.XOR
                else -> return null
            }
            val destTemp = TEMP(node.tempId)
            var argResult: AssemblyArgTilingResult? = null // set if it can be tiled
            if (e1 == destTemp) {
                argResult = dpTiling.tileArg(e2)
            } else if (e2 == destTemp) {
                argResult = dpTiling.tileArg(e1)
            }
            if (argResult == null) {
                return null // neither e1 or e2 match dest
            }
            val instructions = mutableListOf<AssemblyInstruction>()
            instructions += COMMENT(comment = "TileMoveCommutativeOp: $node")
            instructions += argResult.instructions
            val arg = argResult.arg
            val changedReg = REG(node.tempId)
            if (opType == null) {
                // mul or hmul case
                if (arg is AssemblyArgs.Const) {
                    val tempReg = dpTiling.context.nextReg()
                    instructions += MOVE(tempReg, arg)
                    instructions += IMUL(changedReg, tempReg)
                } else {
                    instructions += IMUL(changedReg, arg as RegOrMem)
                }
            } else {
                instructions += BIN_OP(opType, changedReg, arg)
            }
            return StatementTilingResult(instructions)
        }
    }

    object SubForMoveTemp : IrStatementTile<MoveTemp> {
        override fun getTilingResult(node: MoveTemp, dpTiling: DpTiling): StatementTilingResult? {
            val source = node.source as? MidIrExpression.Op ?: return null
            val (operator, e1, e2) = source
            if (operator !== MidIrOperator.SUB) {
                return null
            }
            val destTemp = TEMP(node.tempId)
            if (e1 != destTemp) {
                return null
            }
            val argResult = dpTiling.tileArg(e2)
            val instructions = mutableListOf<AssemblyInstruction>()
            instructions += COMMENT(comment = "TileMoveSub: $node")
            instructions += argResult.instructions
            instructions += BIN_OP(AlBinaryOpType.SUB, REG(node.tempId), argResult.arg)
            return StatementTilingResult(instructions)
        }
    }

    object CommutativeOpForMoveMem : IrStatementTile<MoveMem> {
        override fun getTilingResult(node: MoveMem, dpTiling: DpTiling): StatementTilingResult? {
            val source = node.source as? MidIrExpression.Op ?: return null
            val (operator, e1, e2) = source
            val opType: AlBinaryOpType
            opType = when (operator) {
                MidIrOperator.ADD -> AlBinaryOpType.ADD
                MidIrOperator.AND -> AlBinaryOpType.AND
                MidIrOperator.OR -> AlBinaryOpType.OR
                MidIrOperator.XOR -> AlBinaryOpType.XOR
                else -> // not commutative, die
                    return null
            }
            val destMem = MidIrExpression.Mem(node.memLocation)
            var argResult: ConstOrRegTilingResult? = null // set if it can be tiled
            if (e1 == destMem) {
                argResult = dpTiling.tileConstOrReg(e2)
            } else if (e2 == destMem) {
                argResult = dpTiling.tileConstOrReg(e1)
            }
            if (argResult == null) { // neither e1 or e2 match dest
                return null
            }
            val instructions = mutableListOf<AssemblyInstruction>()
            instructions += COMMENT(comment = "TileMoveCommutativeOp: $node")
            instructions += argResult.instructions
            val (instructions1, changedMem) = MemTilingHelper.tileMem(destMem, dpTiling)
            instructions += instructions1
            instructions += BIN_OP(opType, changedMem, argResult.constOrReg)
            return StatementTilingResult(instructions)
        }
    }

    object SubForMoveMem : IrStatementTile<MoveMem> {
        override fun getTilingResult(node: MoveMem, dpTiling: DpTiling): StatementTilingResult? {
            val source = node.source as? MidIrExpression.Op ?: return null
            val (operator, e1, e2) = source
            if (operator !== MidIrOperator.SUB) {
                return null
            }
            val destMem = MidIrExpression.Mem(node.memLocation)
            if (e1 != destMem) {
                return null
            }
            val argResult = dpTiling.tileConstOrReg(e2)
            val instructions = mutableListOf<AssemblyInstruction>()
            instructions += COMMENT(comment = "TileMoveSub: $node")
            instructions += argResult.instructions
            val (instructions1, mem) = MemTilingHelper.tileMem(destMem, dpTiling)
            instructions += instructions1
            instructions += BIN_OP(AlBinaryOpType.SUB, mem, argResult.constOrReg)
            return StatementTilingResult(instructions)
        }
    }
}
