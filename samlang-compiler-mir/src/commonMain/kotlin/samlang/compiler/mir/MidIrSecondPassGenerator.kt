package samlang.compiler.mir

import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Companion.ESEQ
import samlang.ast.mir.MidIrExpression.Companion.IMMUTABLE_MEM
import samlang.ast.mir.MidIrExpression.Companion.OP
import samlang.ast.mir.MidIrExpression.Companion.TEMP
import samlang.ast.mir.MidIrExpression.Constant
import samlang.ast.mir.MidIrExpression.ExprSequence
import samlang.ast.mir.MidIrExpression.Mem
import samlang.ast.mir.MidIrExpression.Name
import samlang.ast.mir.MidIrExpression.Op
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrExpressionVisitor
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.CallFunction
import samlang.ast.mir.MidIrStatement.Companion.CALL_FUNCTION
import samlang.ast.mir.MidIrStatement.Companion.CJUMP
import samlang.ast.mir.MidIrStatement.Companion.MOVE
import samlang.ast.mir.MidIrStatement.Companion.MOVE_IMMUTABLE_MEM
import samlang.ast.mir.MidIrStatement.ConditionalJump
import samlang.ast.mir.MidIrStatement.ConditionalJumpFallThrough
import samlang.ast.mir.MidIrStatement.Jump
import samlang.ast.mir.MidIrStatement.Label
import samlang.ast.mir.MidIrStatement.MoveMem
import samlang.ast.mir.MidIrStatement.MoveTemp
import samlang.ast.mir.MidIrStatement.Return
import samlang.ast.mir.MidIrStatement.Sequence
import samlang.ast.mir.MidIrStatementVisitor

/** Generate canonical mid IR in the second pass. */
internal class MidIrSecondPassGenerator(private val allocator: MidIrResourceAllocator) {
    private val statementGenerator: StatementGenerator = StatementGenerator()
    private val expressionGenerator: ExpressionGenerator = ExpressionGenerator()

    /**
     * @param statement the statement to lower.
     * @return the lowered statement.
     */
    fun lower(statement: MidIrStatement): List<MidIrStatement> =
        statement.accept(statementGenerator, Unit)

    /**
     * @param expression the statement to lower.
     * @return the lowered expression.
     */
    private fun lower(expression: MidIrExpression): ExprSequence =
        expression.accept(expressionGenerator, Unit)

    /**
     * Lower an expression list.
     *
     * @param expressionList the list to lower.
     * @return (lowered preparation statement list, lowered final expression list to use).
     */
    private fun lowerExprList(
        expressionList: List<MidIrExpression>
    ): Pair<MutableList<MidIrStatement>, List<MidIrExpression>> {
        if (allCanonical(expressions = expressionList)) {
            return mutableListOf<MidIrStatement>() to expressionList.map { MidIrOpReorderingUtil.reorder(it) }
        }
        val argsLoweringResult = expressionList.map { this.lower(it) }
        val argsTempList = mutableListOf<MidIrExpression>()
        val sequence = mutableListOf<MidIrStatement>()
        for (loweringResult in argsLoweringResult) {
            val statements = loweringResult.statements
            val expr = loweringResult.expression
            sequence.addAll(statements)
            val temporary = allocator.allocateTemp()
            sequence.add(MOVE(temporary, expr))
            argsTempList.add(temporary)
        }
        return sequence to argsTempList
    }

    private inner class StatementGenerator : MidIrStatementVisitor<Unit, List<MidIrStatement>> {
        override fun visit(node: MoveTemp, context: Unit): List<MidIrStatement> {
            val src = node.source
            val loweringResultOfSrc = lower(src)
            val newSequence = loweringResultOfSrc.statements.toMutableList()
            newSequence += MOVE(TEMP(node.tempId), loweringResultOfSrc.expression)
            return newSequence
        }

        override fun visit(node: MoveMem, context: Unit): List<MidIrStatement> {
            val dest = node.memLocation
            val src = node.source
            if (bothCanonical(dest, src)) {
                // if both dest and src are canonical, then we don't need to change anything.
                return listOf(
                    MOVE_IMMUTABLE_MEM(
                        destination = IMMUTABLE_MEM(expression = MidIrOpReorderingUtil.reorder(dest)),
                        source = MidIrOpReorderingUtil.reorder(src)
                    )
                )
            }
            val loweringResultOfDest = lower(dest)
            val loweringResultOfSrc = lower(src)
            val destTemp = allocator.allocateTemp()
            val newSequence = loweringResultOfDest.statements.toMutableList()
            newSequence += MOVE(destTemp, loweringResultOfDest.expression)
            newSequence += loweringResultOfSrc.statements
            newSequence += MOVE_IMMUTABLE_MEM(IMMUTABLE_MEM(expression = destTemp), loweringResultOfSrc.expression)
            return newSequence
        }

        override fun visit(node: CallFunction, context: Unit): List<MidIrStatement> {
            val funExprLoweringResult = lower(node.functionExpr)
            val sequence = funExprLoweringResult.statements.toMutableList()
            val (argumentStatements, argsTempList) = lowerExprList(node.arguments)
            sequence += argumentStatements
            sequence += CALL_FUNCTION(
                expression = funExprLoweringResult.expression,
                arguments = argsTempList,
                returnCollector = node.returnCollector
            )
            return sequence
        }

        override fun visit(node: Sequence, context: Unit): List<MidIrStatement> =
            node.statements.map { lower(statement = it) }.flatten()

        override fun visit(node: Jump, context: Unit): List<MidIrStatement> = listOf(node)

        override fun visit(node: ConditionalJump, context: Unit): List<MidIrStatement> {
            val loweringResult = lower(node.condition)
            val newSequence = loweringResult.statements.toMutableList()
            newSequence += CJUMP(loweringResult.expression, node.label1, node.label2)
            return newSequence
        }

        override fun visit(node: ConditionalJumpFallThrough, context: Unit): List<MidIrStatement> =
            error(message = "This node should not be generated in MIR.")

        override fun visit(node: Label, context: Unit): List<MidIrStatement> = listOf(node)

        override fun visit(node: Return, context: Unit): List<MidIrStatement> {
            val returnedExpression = node.returnedExpression ?: return listOf(node)
            val (newSequence, loweredReturnExpression) = lower(expression = returnedExpression)
            require(value = isCanonical(loweredReturnExpression)) {
                "Bad. original $returnedExpression new: $loweredReturnExpression"
            }
            return newSequence + Return(returnedExpression = loweredReturnExpression)
        }
    }

    private inner class ExpressionGenerator : MidIrExpressionVisitor<Unit, ExprSequence> {
        override fun visit(node: Constant, context: Unit): ExprSequence = ESEQ(statements = emptyList(), expression = node)
        override fun visit(node: Name, context: Unit): ExprSequence = ESEQ(statements = emptyList(), expression = node)
        override fun visit(node: Temporary, context: Unit): ExprSequence = ESEQ(statements = emptyList(), expression = node)

        override fun visit(node: Op, context: Unit): ExprSequence {
            val e1 = node.e1
            val e2 = node.e2
            val loweringResultOfE1 = lower(e1)
            val loweringResultOfE2 = lower(e2)
            if (bothCanonical(e1, e2)) {
                // if both e1 and e2 are canonical, then we don't need to change anything.
                return ESEQ(listOf(), MidIrOpReorderingUtil.reorder(node))
            }
            val e1Temp = allocator.allocateTemp()
            val newSequence = loweringResultOfE1.statements.toMutableList()
            newSequence.add(MOVE(e1Temp, loweringResultOfE1.expression))
            newSequence.addAll(loweringResultOfE2.statements)
            val e2Expr = loweringResultOfE2.expression
            val newExpr = MidIrOpReorderingUtil.reorder(OP(node.operator, e1Temp, e2Expr))
            return ESEQ(newSequence, newExpr)
        }

        override fun visit(node: Mem, context: Unit): ExprSequence {
            val (sequence, expr) = lower(node.expression)
            return ESEQ(sequence, IMMUTABLE_MEM(expression = expr))
        }

        override fun visit(node: ExprSequence, context: Unit): ExprSequence {
            val newSequence = node.statements.map { lower(it) }.flatten().toMutableList()
            val exprLoweringResult = lower(node.expression)
            newSequence += exprLoweringResult.statements
            return ESEQ(newSequence, exprLoweringResult.expression)
        }
    }

    private object CanonicalChecker : MidIrExpressionVisitor<Unit, Boolean> {
        override fun visit(node: Constant, context: Unit): Boolean = true
        override fun visit(node: Name, context: Unit): Boolean = true
        override fun visit(node: Temporary, context: Unit): Boolean = true

        override fun visit(node: Op, context: Unit): Boolean =
            node.e1.accept(visitor = this, context = Unit) && node.e2.accept(visitor = this, context = Unit)

        override fun visit(node: Mem, context: Unit): Boolean =
            node.expression.accept(visitor = this, context = Unit)

        override fun visit(node: ExprSequence, context: Unit): Boolean = false
    }

    private companion object {
        private fun isCanonical(e: MidIrExpression): Boolean = e.accept(CanonicalChecker, Unit)

        private fun bothCanonical(e1: MidIrExpression, e2: MidIrExpression): Boolean =
            isCanonical(e1) && isCanonical(e2)

        private fun allCanonical(expressions: Collection<MidIrExpression>): Boolean {
            for (expr in expressions) {
                if (!isCanonical(expr)) {
                    return false
                }
            }
            return true
        }
    }
}
