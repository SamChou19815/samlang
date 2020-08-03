package samlang.compiler.asm.tiling

import samlang.ast.asm.AssemblyArgs.CONST
import samlang.ast.asm.AssemblyArgs.MEM
import samlang.ast.asm.AssemblyArgs.NAME
import samlang.ast.asm.AssemblyArgs.REG
import samlang.ast.asm.AssemblyArgs.RIP
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.Companion.CMP
import samlang.ast.asm.AssemblyInstruction.Companion.COMMENT
import samlang.ast.asm.AssemblyInstruction.Companion.JUMP
import samlang.ast.asm.AssemblyInstruction.Companion.LABEL
import samlang.ast.asm.AssemblyInstruction.Companion.LEA
import samlang.ast.asm.AssemblyInstruction.Companion.MOVE
import samlang.ast.asm.AssemblyInstruction.JumpType
import samlang.compiler.asm.common.FunctionContext
import samlang.ast.common.IrOperator
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrExpressionVisitor
import samlang.ast.mir.MidIrLoweredStatementVisitor
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.CallFunction
import samlang.ast.mir.MidIrStatement.ConditionalJumpFallThrough
import samlang.ast.mir.MidIrStatement.Jump
import samlang.ast.mir.MidIrStatement.MoveMem
import samlang.ast.mir.MidIrStatement.MoveTemp
import samlang.compiler.asm.tiling.MemTilingHelper.tileMem
import samlang.compiler.asm.tiling.TileCallingConvention.CallTiler.getTilingResult
import samlang.compiler.asm.tiling.TileCallingConvention.ReturnTiler.getTilingResult

/**
 * @param context the tiling context.
 */
class DpTiling(val context: FunctionContext) {
    /** The statement tiling visitor.  */
    private val statementTilingVisitor = StatementTilingVisitor()
    /** The expression tiling visitor.  */
    private val expressionTilingVisitor = ExpressionTilingVisitor()
    /** The memoized statement tiling function.  */
    private val statementTilingFunction: MemoizedFunction<MidIrStatement, StatementTilingResult> =
        MemoizedFunction.memo { statement -> statement.accept(statementTilingVisitor, Unit) }
    /** The memoized expression tiling function.  */
    private val expressionTilingFunction: MemoizedFunction<MidIrExpression, ExpressionTilingResult> =
        MemoizedFunction.memo { expression -> expression.accept(expressionTilingVisitor, Unit) }

    /**
     * @param statements a list of statements to tile.
     * @return the tiled assembly instructions.
     */
    fun tile(statements: List<MidIrStatement>): List<AssemblyInstruction> {
        val instructions = mutableListOf<AssemblyInstruction>()
        for (statement in statements) {
            instructions += tile(statement).instructions
        }
        instructions.add(LABEL(label = "LABEL_FUNCTION_CALL_EPILOGUE_FOR_${context.functionName}"))
        return instructions
    }

    /**
     * @param statement the statement to tile.
     * @return the tiling result.
     */
    private fun tile(statement: MidIrStatement): StatementTilingResult = statementTilingFunction(statement)

    /**
     * @param expression the expression to tile.
     * @return the tiling result.
     */
    fun tile(expression: MidIrExpression): ExpressionTilingResult = expressionTilingFunction(expression)

    /**
     * @param expression the expression to tile.
     * @return the tiling result.
     */
    fun tileConstOrReg(expression: MidIrExpression): ConstOrRegTilingResult {
        if (expression is MidIrExpression.Constant) {
            val intValue = expression.intValue
            if (intValue != null) {
                return ConstTilingResult(CONST(intValue))
            }
        }
        return tile(expression)
    }

    /**
     * @param expression the expression to tile.
     * @return the tiling result.
     */
    fun tileRegOrMem(expression: MidIrExpression): RegOrMemTilingResult {
        return if (expression is MidIrExpression.Mem) {
            tileMem(expression, this)
        } else {
            tile(expression)
        }
    }

    /**
     * @param expression the expression to tile.
     * @return the tiling result.
     */
    fun tileArg(expression: MidIrExpression): AssemblyArgTilingResult {
        if (expression is MidIrExpression.Constant) {
            val intValue = expression.intValue
            if (intValue != null) {
                return ConstTilingResult(CONST(intValue))
            }
        }
        return if (expression is MidIrExpression.Mem) {
            tileMem(expression, this)
        } else {
            tile(expression)
        }
    }

    /**
     * @param node the node to tile.
     * @param tiles possible tiles.
     * @param N the type of node.
     * @param R the type of tiling result.
     * @return the best possible tiling result.
     */
    private fun <N, R : TilingResult?, T : IrTile<N, R>?> tile(node: N, tiles: List<T>): R {
        var best: R? = null
        var bestCost = Int.MAX_VALUE
        for (tile in tiles) {
            val result = tile!!.getTilingResult(node, this)
            if (result != null) {
                val cost = result.cost
                if (cost < bestCost) {
                    best = result
                    bestCost = cost
                }
            }
        }
        if (best == null) {
            throw Error("We do not cover every possible case of tiling! BAD!")
        }
        return best
    }

    /*
     * --------------------------------------------------------------------------------
     * Implementation Note:
     * Some tiling strategies are directly written inside the functions because there
     * is only one possible tiling when we look it along.
     * For more complex ones, the memoization framework should be used.
     * --------------------------------------------------------------------------------
     */
    private inner class StatementTilingVisitor : MidIrLoweredStatementVisitor<Unit, StatementTilingResult> {
        private val moveTempTiles: List<IrStatementTile<MoveTemp>> = listOf(
            TileGenericMoveTemp,
            TileMoveOp.LeaForMoveTemp,
            TileMoveOp.CommutativeOpForMoveTemp,
            TileMoveOp.SubForMoveTemp,
            TileMul3Args.ForMoveTemp,
            TileNeg.NegForMoveTemp,
            TileOpPowTwo.ForMoveTemp
        )
        private val moveMemTiles: List<IrStatementTile<MoveMem>> = listOf(
            TileGenericMoveMem,
            TileMoveOp.CommutativeOpForMoveMem,
            TileMoveOp.SubForMoveMem,
            TileMul3Args.ForMoveMem,
            TileNeg.NegForMoveMem,
            TileOpPowTwo.ForMoveMem
        )

        override fun visit(node: MoveTemp, context: Unit): StatementTilingResult =
            tile(node, moveTempTiles)

        override fun visit(node: MoveMem, context: Unit): StatementTilingResult =
            tile(node, moveMemTiles)

        override fun visit(node: CallFunction, context: Unit): StatementTilingResult =
            getTilingResult(node, this@DpTiling)

        override fun visit(node: Jump, context: Unit): StatementTilingResult =
            StatementTilingResult(listOf(JUMP(JumpType.JMP, node.label)))

        override fun visit(node: ConditionalJumpFallThrough, context: Unit): StatementTilingResult {
            // note: the trace reorganizer is supposed to flip condition for us.
            val condition = node.condition
            val instructions = mutableListOf<AssemblyInstruction>()
            instructions += COMMENT(node)
            if (condition is MidIrExpression.Op) {
                val (operator, e1, e2) = condition
                val jumpType = when (operator) {
                    IrOperator.LT -> JumpType.JL
                    IrOperator.GT -> JumpType.JG
                    IrOperator.LE -> JumpType.JLE
                    IrOperator.GE -> JumpType.JGE
                    IrOperator.EQ -> JumpType.JE
                    IrOperator.NE -> JumpType.JNE
                    else -> null
                }
                if (jumpType != null) {
                    val (instructions1, e1Arg) = tile(e1)
                    val e2Result = tileConstOrReg(e2)
                    instructions += instructions1
                    instructions += e2Result.instructions
                    val e2Arg = e2Result.constOrReg
                    instructions += CMP(e1Arg, e2Arg)
                    instructions += JUMP(jumpType, node.label1)
                    return StatementTilingResult(instructions)
                }
            }
            val conditionTilingResult = tileRegOrMem(condition)
            instructions += conditionTilingResult.instructions
            instructions += CMP(conditionTilingResult.regOrMem, CONST(value = 0))
            instructions += JUMP(JumpType.JNZ, node.label1)
            return StatementTilingResult(instructions)
        }

        override fun visit(node: MidIrStatement.Label, context: Unit): StatementTilingResult =
            StatementTilingResult(listOf(LABEL(node.name)))

        override fun visit(node: MidIrStatement.Return, context: Unit): StatementTilingResult =
            getTilingResult(node = node, dpTiling = this@DpTiling)
    }

    private inner class ExpressionTilingVisitor : MidIrExpressionVisitor<Unit, ExpressionTilingResult> {
        private val opTiles: List<IrExpressionTile<MidIrExpression.Op>> = listOf(
            TileGenericCommutativeOpReversed,
            TileGenericOp,
            TileMul3Args.ForOp,
            TileOpByLEA,
            TileOpPowTwo.ForOp
        )

        override fun visit(node: MidIrExpression.Constant, context: Unit): ExpressionTilingResult {
            val reg = this@DpTiling.context.nextReg()
            return ExpressionTilingResult(listOf(MOVE(reg, node.value)), reg)
        }

        override fun visit(node: MidIrExpression.Name, context: Unit): ExpressionTilingResult {
            val reg = this@DpTiling.context.nextReg()
            // In general, a name cannot stand on its own.
            // We need this lea trick to associate it with rip
            // For functions and mem[name], we will handle them specially in their tilers!
            return ExpressionTilingResult(
                instructions = listOf(LEA(reg, MEM(RIP, NAME(node.name)))),
                reg = reg
            )
        }

        override fun visit(node: Temporary, context: Unit): ExpressionTilingResult =
            ExpressionTilingResult(emptyList(), REG(node.id))

        override fun visit(node: MidIrExpression.Op, context: Unit): ExpressionTilingResult =
            tile(node, opTiles)

        override fun visit(node: MidIrExpression.Mem, context: Unit): ExpressionTilingResult {
            val (instructions1, mem) = tileMem(mem = node, dpTiling = this@DpTiling)
            val instructions = mutableListOf<AssemblyInstruction>()
            instructions += COMMENT(node)
            instructions += instructions1
            val resultReg = this@DpTiling.context.nextReg()
            instructions += MOVE(resultReg, mem)
            return ExpressionTilingResult(instructions, resultReg)
        }
    }
}
