package samlang.compiler.asm.tiling

import samlang.ast.asm.AssemblyArg
import samlang.ast.asm.AssemblyArgs
import samlang.ast.asm.AssemblyArgs.CONST
import samlang.ast.asm.AssemblyArgs.MEM
import samlang.ast.asm.AssemblyArgs.NAME
import samlang.ast.asm.AssemblyArgs.R8
import samlang.ast.asm.AssemblyArgs.R9
import samlang.ast.asm.AssemblyArgs.RAX
import samlang.ast.asm.AssemblyArgs.RCX
import samlang.ast.asm.AssemblyArgs.RDI
import samlang.ast.asm.AssemblyArgs.RDX
import samlang.ast.asm.AssemblyArgs.REG
import samlang.ast.asm.AssemblyArgs.RIP
import samlang.ast.asm.AssemblyArgs.RSI
import samlang.ast.asm.AssemblyArgs.RSP
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.AlBinaryOpType.*
import samlang.ast.asm.AssemblyInstruction.Companion.BIN_OP
import samlang.ast.asm.AssemblyInstruction.Companion.CMP
import samlang.ast.asm.AssemblyInstruction.Companion.COMMENT
import samlang.ast.asm.AssemblyInstruction.Companion.IMUL
import samlang.ast.asm.AssemblyInstruction.Companion.JUMP
import samlang.ast.asm.AssemblyInstruction.Companion.LABEL
import samlang.ast.asm.AssemblyInstruction.Companion.LEA
import samlang.ast.asm.AssemblyInstruction.Companion.MOVE
import samlang.ast.asm.AssemblyInstruction.JumpType
import samlang.ast.asm.RegOrMem
import samlang.ast.common.IrOperator
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrExpressionVisitor
import samlang.ast.mir.MidIrLoweredStatementVisitor
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.*
import samlang.compiler.asm.FunctionAbstractRegisterAllocator
import samlang.compiler.asm.tiling.MemTilingHelper.tileMem
import kotlin.math.max

internal class DpTiling(val allocator: FunctionAbstractRegisterAllocator, val functionName: String) {
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
        instructions.add(LABEL(label = "LABEL_FUNCTION_CALL_EPILOGUE_FOR_$functionName"))
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
    private fun tileConstOrReg(expression: MidIrExpression): ConstOrRegTilingResult {
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
    private fun tileRegOrMem(expression: MidIrExpression): RegOrMemTilingResult {
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
    private fun tileArg(expression: MidIrExpression): AssemblyArgTilingResult {
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
    private fun <N, R : TilingResult?, T : IrTile<N, R>> tile(node: N, tiles: List<T>): R {
        var best: R? = null
        var bestCost = Int.MAX_VALUE
        for (tile in tiles) {
            val result = tile.getTilingResult(node, this)
            if (result != null) {
                val cost = result.cost
                if (cost < bestCost) {
                    best = result
                    bestCost = cost
                }
            }
        }
        return best ?: throw Error("We do not cover every possible case of tiling! BAD!")
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
            TileLeaForMoveTemp,
            TileCommutativeOpForMoveTemp,
            TileSubForMoveTemp,
            TileMul3Args.ForMoveTemp,
            TileNegForMoveTemp,
            TileOpPowTwo.ForMoveTemp
        )

        override fun visit(node: MoveTemp, context: Unit): StatementTilingResult = tile(node, moveTempTiles)

        override fun visit(node: MoveMem, context: Unit): StatementTilingResult {
            val irMem = MidIrExpression.IMMUTABLE_MEM(expression = node.memLocation)
            val (memLocInstructions, memLoc) = tileMem(mem = irMem, dpTiling = this@DpTiling)
            val instructions = mutableListOf<AssemblyInstruction>()
            // first add mem loc instructions
            instructions += COMMENT(comment = "GenericMoveMem: $node")
            instructions += memLocInstructions
            val srcTilingResult = tileConstOrReg(node.source)
            instructions += srcTilingResult.instructions
            instructions += MOVE(memLoc, srcTilingResult.constOrReg)
            return StatementTilingResult(instructions)
        }

        override fun visit(node: CallFunction, context: Unit): StatementTilingResult {
            val functionExpr = node.functionExpr
            val instructions = mutableListOf<AssemblyInstruction>()
            instructions += COMMENT(node)
            // preparation: we till the function.
            val irFunctionExpr = node.functionExpr
            val asmFunctionExpr: AssemblyArg
            asmFunctionExpr = if (irFunctionExpr is MidIrExpression.Name) {
                NAME(irFunctionExpr.name)
            } else {
                val functionExprTilingResult = tileArg(irFunctionExpr)
                instructions += functionExprTilingResult.instructions
                functionExprTilingResult.arg
            }
            // preparation: we till all the arguments.
            val args = mutableListOf<AssemblyArg>()
            for (irArg in node.arguments) {
                val tilingResult = tileArg(irArg)
                instructions += tilingResult.instructions
                args += tilingResult.arg
            }
            // preparation: we prepare slots to put the return values.
            val resultReg = node.returnCollector?.let { REG(it.id) }
            // compute the extra space we need.
            val extraArgUnit = max(a = args.size - 6, b = 0)
            val totalScratchSpace = extraArgUnit + 0
            instructions += COMMENT(comment = "We are about to call $functionExpr")
            // setup scratch space for args and return values, also prepare space for 16b alignment.
            if (totalScratchSpace > 0) {
                // we ensure we will eventually push down x units, where x is divisible by 2.
                val offset = if (totalScratchSpace % 2 == 0) 0 else 1
                instructions += BIN_OP(SUB, RSP, CONST(value = 8 * offset))
            }
            // setup arguments and setup scratch space for arg passing
            for (i in args.indices.reversed()) {
                val arg = args[i]
                when (i) {
                    0 -> instructions += MOVE(RDI, arg)
                    1 -> instructions += MOVE(RSI, arg)
                    2 -> instructions += MOVE(RDX, arg)
                    3 -> instructions += MOVE(RCX, arg)
                    4 -> instructions += MOVE(R8, arg)
                    5 -> instructions += MOVE(R9, arg)
                    else -> instructions += AssemblyInstruction.PUSH(arg)
                }
            }
            instructions += AssemblyInstruction.CALL(asmFunctionExpr)
            // get return values back
            if (resultReg != null) {
                instructions += MOVE(resultReg, RAX)
            }
            if (totalScratchSpace > 0) {
                // move the stack up again
                instructions += BIN_OP(ADD, RSP, CONST(value = 8 * totalScratchSpace))
            }
            instructions += COMMENT(comment = "We finished calling $functionExpr")
            return StatementTilingResult(instructions)
        }

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

        override fun visit(node: Label, context: Unit): StatementTilingResult =
            StatementTilingResult(listOf(LABEL(node.name)))

        override fun visit(node: Return, context: Unit): StatementTilingResult {
            val instructions = mutableListOf<AssemblyInstruction>()
            instructions += COMMENT(node)
            val returnedExpression = node.returnedExpression
            // move the stuff into the return position.
            if (returnedExpression != null) {
                val (returnedExpressionInstructions, resultReg) = tile(returnedExpression)
                instructions += returnedExpressionInstructions
                instructions += MOVE(RAX, resultReg)
            }
            // jump to the end of functions body / start of epilogue
            instructions += JUMP(type = JumpType.JMP, label = "LABEL_FUNCTION_CALL_EPILOGUE_FOR_${functionName}")
            return StatementTilingResult(instructions)
        }
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
            val reg = this@DpTiling.allocator.nextReg()
            return ExpressionTilingResult(listOf(MOVE(reg, node.value)), reg)
        }

        override fun visit(node: MidIrExpression.Name, context: Unit): ExpressionTilingResult {
            val reg = this@DpTiling.allocator.nextReg()
            // In general, a name cannot stand on its own.
            // We need this lea trick to associate it with rip
            // For functions and mem[name], we will handle them specially in their tilers!
            return ExpressionTilingResult(instructions = listOf(LEA(reg, MEM(RIP, NAME(node.name)))), reg = reg)
        }

        override fun visit(node: Temporary, context: Unit): ExpressionTilingResult =
            ExpressionTilingResult(emptyList(), REG(node.id))

        override fun visit(node: MidIrExpression.Op, context: Unit): ExpressionTilingResult = tile(node, opTiles)

        override fun visit(node: MidIrExpression.Mem, context: Unit): ExpressionTilingResult {
            val (instructions1, mem) = tileMem(mem = node, dpTiling = this@DpTiling)
            val instructions = mutableListOf<AssemblyInstruction>()
            instructions += COMMENT(node)
            instructions += instructions1
            val resultReg = this@DpTiling.allocator.nextReg()
            instructions += MOVE(resultReg, mem)
            return ExpressionTilingResult(instructions, resultReg)
        }
    }

    /** @param T type of the IR node. */
    private interface IrTile<T, R : TilingResult> {
        /**
         * @param node the node to tile.
         * @param dpTiling the dp tiling class.
         * @return the tiling result, or null if it is impossible to tile this node with this tile.
         */
        fun getTilingResult(node: T, dpTiling: DpTiling): R?
    }

    /** A tile for IR statements. */
    private interface IrStatementTile<T : MidIrStatement> : IrTile<T, StatementTilingResult>

    /** A tile for IR expressions. */
    private interface IrExpressionTile<T : MidIrExpression> : IrTile<T, ExpressionTilingResult>

    /**
     * A generic tiling of commutative op expression, but in reverse order.
     * It's a complement for TileGenericOp
     */
    private object TileGenericCommutativeOpReversed : IrExpressionTile<MidIrExpression.Op> {
        override fun getTilingResult(node: MidIrExpression.Op, dpTiling: DpTiling): ExpressionTilingResult? {
            val instructions = mutableListOf<AssemblyInstruction>()
            val resultReg = dpTiling.allocator.nextReg()
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
                    instructions += BIN_OP(ADD, resultReg, e1RegOrMem)
                }
                IrOperator.MUL -> {
                    instructions += MOVE(resultReg, e2Reg)
                    instructions += IMUL(resultReg, e1RegOrMem)
                }
                IrOperator.XOR -> {
                    instructions += MOVE(resultReg, e2Reg)
                    instructions += BIN_OP(XOR, resultReg, e1RegOrMem)
                }
                else -> throw Error()
            }
            return ExpressionTilingResult(instructions, resultReg)
        }
    }

    private object TileGenericMoveTemp : IrStatementTile<MoveTemp> {
        override fun getTilingResult(node: MoveTemp, dpTiling: DpTiling): StatementTilingResult {
            val irSource = node.source
            val resultReg = REG(node.tempId)
            val srcTilingResult = dpTiling.tileArg(irSource)
            val instructions = mutableListOf<AssemblyInstruction>()
            instructions += COMMENT(comment = "GenericMoveTemp: $node")
            instructions += srcTilingResult.instructions
            instructions += MOVE(resultReg, srcTilingResult.arg)
            return StatementTilingResult(instructions)
        }
    }

    private object TileGenericOp : IrExpressionTile<MidIrExpression.Op> {
        override fun getTilingResult(node: MidIrExpression.Op, dpTiling: DpTiling): ExpressionTilingResult {
            val instructions = mutableListOf<AssemblyInstruction>()
            val resultReg = dpTiling.allocator.nextReg()
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
                    instructions += BIN_OP(ADD, resultReg, e2RegOrMem)
                }
                IrOperator.SUB -> {
                    instructions += MOVE(resultReg, e1Reg)
                    instructions += BIN_OP(SUB, resultReg, e2RegOrMem)
                }
                IrOperator.MUL -> {
                    instructions += MOVE(resultReg, e1Reg)
                    instructions += IMUL(resultReg, e2RegOrMem)
                }
                IrOperator.DIV -> {
                    instructions += MOVE(RAX, e1Reg)
                    instructions += AssemblyInstruction.CQO()
                    instructions += AssemblyInstruction.IDIV(e2RegOrMem)
                    instructions += MOVE(resultReg, RAX)
                }
                IrOperator.MOD -> {
                    instructions += MOVE(RAX, e1Reg)
                    instructions += AssemblyInstruction.CQO()
                    instructions += AssemblyInstruction.IDIV(e2RegOrMem)
                    instructions += MOVE(resultReg, RDX)
                }
                IrOperator.LT -> {
                    instructions += CMP(e1Reg, e2RegOrMem as AssemblyArgs.Reg)
                    instructions += AssemblyInstruction.SET(JumpType.JL, RAX)
                    instructions += MOVE(resultReg, RAX)
                }
                IrOperator.LE -> {
                    instructions += CMP(e1Reg, e2RegOrMem as AssemblyArgs.Reg)
                    instructions += AssemblyInstruction.SET(JumpType.JLE, RAX)
                    instructions += MOVE(resultReg, RAX)
                }
                IrOperator.GT -> {
                    instructions += CMP(e1Reg, e2RegOrMem as AssemblyArgs.Reg)
                    instructions += AssemblyInstruction.SET(JumpType.JG, RAX)
                    instructions += MOVE(resultReg, RAX)
                }
                IrOperator.GE -> {
                    instructions += CMP(e1Reg, e2RegOrMem as AssemblyArgs.Reg)
                    instructions += AssemblyInstruction.SET(JumpType.JGE, RAX)
                    instructions += MOVE(resultReg, RAX)
                }
                IrOperator.EQ -> {
                    instructions += CMP(e1Reg, e2RegOrMem as AssemblyArgs.Reg)
                    instructions += AssemblyInstruction.SET(JumpType.JE, RAX)
                    instructions += MOVE(resultReg, RAX)
                }
                IrOperator.NE -> {
                    instructions += CMP(e1Reg, e2RegOrMem as AssemblyArgs.Reg)
                    instructions += AssemblyInstruction.SET(JumpType.JNE, RAX)
                    instructions += MOVE(resultReg, RAX)
                }
                IrOperator.XOR -> {
                    instructions += MOVE(resultReg, e1Reg)
                    instructions += BIN_OP(XOR, resultReg, e2RegOrMem)
                }
            }
            return ExpressionTilingResult(instructions, resultReg)
        }
    }

    /** A tiling for op that tried to use LEA. */
    private object TileOpByLEA : IrExpressionTile<MidIrExpression.Op> {
        override fun getTilingResult(
            node: MidIrExpression.Op,
            dpTiling: DpTiling
        ): ExpressionTilingResult? {
            val resultReg = dpTiling.allocator.nextReg()
            // try to use LEA if we can
            val (instructions1, mem) = MemTilingHelper.tileExprForMem(node, dpTiling) ?: return null
            val instructions = mutableListOf<AssemblyInstruction>()
            instructions += COMMENT(comment = node)
            instructions += instructions1
            instructions += LEA(dest = resultReg, src = mem)
            return ExpressionTilingResult(instructions, resultReg)
        }
    }

    private object TileLeaForMoveTemp : IrStatementTile<MoveTemp> {
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

    private object TileCommutativeOpForMoveTemp : IrStatementTile<MoveTemp> {
        override fun getTilingResult(node: MoveTemp, dpTiling: DpTiling): StatementTilingResult? {
            val source = node.source as? MidIrExpression.Op ?: return null
            val (operator, e1, e2) = source
            val opType: AssemblyInstruction.AlBinaryOpType?
            opType = when (operator) {
                IrOperator.ADD -> ADD
                IrOperator.MUL -> null
                IrOperator.XOR -> XOR
                else -> return null
            }
            val destTemp = MidIrExpression.TEMP(node.tempId)
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
                    val tempReg = dpTiling.allocator.nextReg()
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

    private object TileSubForMoveTemp : IrStatementTile<MoveTemp> {
        override fun getTilingResult(node: MoveTemp, dpTiling: DpTiling): StatementTilingResult? {
            val source = node.source as? MidIrExpression.Op ?: return null
            val (operator, e1, e2) = source
            if (operator !== IrOperator.SUB) {
                return null
            }
            val destTemp = MidIrExpression.TEMP(node.tempId)
            if (e1 != destTemp) {
                return null
            }
            val argResult = dpTiling.tileArg(e2)
            val instructions = mutableListOf<AssemblyInstruction>()
            instructions += COMMENT(comment = "TileMoveSub: $node")
            instructions += argResult.instructions
            instructions += BIN_OP(SUB, REG(node.tempId), argResult.arg)
            return StatementTilingResult(instructions)
        }
    }

    private object TileNegForMoveTemp : IrStatementTile<MoveTemp> {
        override fun getTilingResult(node: MoveTemp, dpTiling: DpTiling): StatementTilingResult? {
            val source = node.source as? MidIrExpression.Op ?: return null
            val destIrTemp = MidIrExpression.TEMP(node.tempId)
            return if (opIsForNeg(source, destIrTemp)) {
                StatementTilingResult(listOf(COMMENT(node), AssemblyInstruction.NEG(REG(node.tempId))))
            } else null
        }

        private fun opIsForNeg(source: MidIrExpression.Op, dest: MidIrExpression): Boolean {
            // the case for 0 - x
            if (source.operator === IrOperator.SUB && source.e1 == MidIrExpression.ZERO && source.e2 == dest) {
                return true
            }
            // the case for (-1) * x or x * (-1)
            return if (source.operator !== IrOperator.MUL) {
                false
            } else {
                source.e1 == dest && source.e2 == MidIrExpression.MINUS_ONE || source.e2 == dest && source.e1 == MidIrExpression.MINUS_ONE
            }
        }
    }

    /** The tiles for 3-arg form of imul for ops and move. */
    private object TileMul3Args {
        private fun tryToTile(dpTiling: DpTiling, src: MidIrExpression): Triple<List<AssemblyInstruction>, RegOrMem, AssemblyArgs.Const>? {
            if (src !is MidIrExpression.Op) return null
            val (operator, e1, e2) = src
            if (operator !== IrOperator.MUL) return null
            if (e2 !is MidIrExpression.Constant) return null
            if (e2.value <= Int.MAX_VALUE || e2.value >= Int.MIN_VALUE) {
                val tilingResult = dpTiling.tileRegOrMem(e1)
                return Triple(tilingResult.instructions, tilingResult.regOrMem, CONST(value = e2.value.toInt()))
            }
            return null
        }

        object ForMoveTemp : IrStatementTile<MoveTemp> {
            override fun getTilingResult(node: MoveTemp, dpTiling: DpTiling): StatementTilingResult? {
                val (tileInstructions, op1, op2) = tryToTile(dpTiling, node.source) ?: return null
                val instructions = mutableListOf<AssemblyInstruction>()
                instructions += COMMENT(comment = "TileMul3ArgsForMove: $node")
                instructions += tileInstructions
                instructions += IMUL(REG(node.tempId), op1, op2)
                return StatementTilingResult(instructions)
            }
        }

        object ForOp : IrExpressionTile<MidIrExpression.Op> {
            override fun getTilingResult(node: MidIrExpression.Op, dpTiling: DpTiling): ExpressionTilingResult? {
                val (tileInstructions, op1, op2) = tryToTile(dpTiling, node) ?: return null
                val resultReg = dpTiling.allocator.nextReg()
                val instructions = mutableListOf<AssemblyInstruction>()
                instructions += COMMENT(comment = "TileMul3ArgsForOp: $node")
                instructions += tileInstructions
                instructions += IMUL(resultReg, op1, op2)
                return ExpressionTilingResult(instructions, resultReg)
            }
        }
    }

    private object TileOpPowTwo {
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
                            val tempReg = dpTiling.allocator.nextReg()
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
                if (e2 is MidIrExpression.Constant && isPowerOfTwo(e2.value)) {
                    if (e1 == destExpr) {
                        logTwo(e2.value)
                    } else {
                        null
                    }
                } else if (e1 is MidIrExpression.Constant && isPowerOfTwo(e1.value)) {
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
                if (e2 is MidIrExpression.Constant && isPowerOfTwo(e2.value)) {
                    val e1Result = dpTiling.tileArg(e1)
                    argToShift = e1Result.arg
                    shiftCount = logTwo(e2.value)
                    instructions.addAll(e1Result.instructions)
                } else if (e1 is MidIrExpression.Constant && isPowerOfTwo(e1.value)) {
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
                    instructions += AssemblyInstruction.SHL(resultPlace, shiftCount)
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

        object ForOp : IrExpressionTile<MidIrExpression.Op> {
            override fun getTilingResult(node: MidIrExpression.Op, dpTiling: DpTiling): ExpressionTilingResult? {
                val resultReg = dpTiling.allocator.nextReg()
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
}
