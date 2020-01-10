package samlang.compiler.mir

import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Call
import samlang.ast.mir.MidIrExpression.Companion.ESEQ
import samlang.ast.mir.MidIrExpression.Companion.MEM
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
import samlang.ast.mir.MidIrStatement.Companion.SEQ
import samlang.ast.mir.MidIrStatement.ConditionalJump
import samlang.ast.mir.MidIrStatement.ConditionalJumpFallThrough
import samlang.ast.mir.MidIrStatement.IgnoreExpression
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
            return arrayListOf<MidIrStatement>() to expressionList.map { IrOpReorderingUtil.reorder(it) }
        }
        val argsLoweringResult = expressionList.map { this.lower(it) }
        val argsTempList = arrayListOf<MidIrExpression>()
        val sequence = arrayListOf<MidIrStatement>()
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
                    MoveMem(
                        memLocation = IrOpReorderingUtil.reorder(dest),
                        source = IrOpReorderingUtil.reorder(src)
                    )
                )
            }
            val loweringResultOfDest = lower(dest)
            val loweringResultOfSrc = lower(src)
            val destTemp = allocator.allocateTemp()
            val newSequence = loweringResultOfDest.statements.toMutableList()
            newSequence += MOVE(destTemp, loweringResultOfDest.expression)
            newSequence += loweringResultOfSrc.statements
            newSequence += MOVE(MEM(destTemp), loweringResultOfSrc.expression)
            return newSequence
        }

        override fun visit(node: IgnoreExpression, context: Unit): List<MidIrStatement> =
            lower(node.expression).statements

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
            val loweredExpr = loweringResult.expression
            val label1 = node.label1
            val label2 = node.label2
            newSequence += CJUMP(loweredExpr, label1, label2)
            return newSequence
        }

        override fun visit(node: ConditionalJumpFallThrough, context: Unit): List<MidIrStatement> =
            error(message = "This node should not be generated in MIR.")

        override fun visit(node: Label, context: Unit): List<MidIrStatement> = listOf(node)

        override fun visit(node: Return, context: Unit): List<MidIrStatement> {
            val returnedExpression = node.returnedExpression ?: return listOf(node)
            val (newSequence, loweredReturnExpression) = lower(expression = returnedExpression)
            return newSequence.statements + Return(returnedExpression = loweredReturnExpression)
        }
    }

    private inner class ExpressionGenerator : MidIrExpressionVisitor<Unit, ExprSequence> {
        override fun visit(node: Constant, context: Unit): ExprSequence = ESEQ(statement = SEQ(), expression = node)
        override fun visit(node: Name, context: Unit): ExprSequence = ESEQ(statement = SEQ(), expression = node)
        override fun visit(node: Temporary, context: Unit): ExprSequence = ESEQ(statement = SEQ(), expression = node)

        override fun visit(node: Op, context: Unit): ExprSequence {
            val e1 = node.e1
            val e2 = node.e2
            val loweringResultOfE1 = lower(e1)
            val loweringResultOfE2 = lower(e2)
            if (bothCanonical(e1, e2)) {
                // if both e1 and e2 are canonical, then we don't need to change anything.
                return ESEQ(SEQ(), IrOpReorderingUtil.reorder(node))
            }
            val e1Temp = allocator.allocateTemp()
            val newSequence = loweringResultOfE1.statements.toMutableList()
            newSequence.add(MOVE(e1Temp, loweringResultOfE1.expression))
            newSequence.addAll(loweringResultOfE2.statements)
            val e2Expr = loweringResultOfE2.expression
            val newExpr = IrOpReorderingUtil.reorder(OP(node.operator, e1Temp, e2Expr))
            return ESEQ(SEQ(newSequence), newExpr)
        }

        override fun visit(node: Mem, context: Unit): ExprSequence {
            val (sequence, expr) = lower(node.expression)
            return ESEQ(sequence, MEM(expr))
        }

        override fun visit(node: Call, context: Unit): ExprSequence {
            val funExprLoweringResult = lower(node.functionExpr)
            val sequence = funExprLoweringResult.statements.toMutableList()
            val (first, argsTempList) = lowerExprList(node.arguments)
            sequence += first
            val argResultTemp = allocator.allocateTemp()
            sequence += CALL_FUNCTION(
                expression = funExprLoweringResult.expression,
                arguments = argsTempList,
                returnCollector = argResultTemp
            )
            return ESEQ(SEQ(sequence), argResultTemp)
        }

        override fun visit(node: ExprSequence, context: Unit): ExprSequence {
            val newSequence = lower(node.sequence).toMutableList()
            val exprLoweringResult = lower(node.expression)
            newSequence += exprLoweringResult.statements
            return ESEQ(SEQ(newSequence), exprLoweringResult.expression)
        }
    }

    private object CanonicalChecker : MidIrExpressionVisitor<Unit, Boolean> {
        override fun visit(node: Constant, context: Unit): Boolean = true
        override fun visit(node: Name, context: Unit): Boolean = true
        override fun visit(node: Temporary, context: Unit): Boolean = true

        override fun visit(node: Op, context: Unit): Boolean =
            node.e1.accept(visitor = this, context = Unit) &&
                    node.e2.accept(visitor = this, context = Unit)

        override fun visit(node: Mem, context: Unit): Boolean =
            node.expression.accept(visitor = this, context = Unit)

        override fun visit(node: Call, context: Unit): Boolean = false
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
