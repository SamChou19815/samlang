package samlang.analysis

import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Constant
import samlang.ast.mir.MidIrExpression.Mem
import samlang.ast.mir.MidIrExpression.Name
import samlang.ast.mir.MidIrExpression.Op
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrExpressionVisitor
import samlang.ast.mir.MidIrLoweredStatementVisitor
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.ConditionalJumpFallThrough
import samlang.ast.mir.MidIrStatement.Jump
import samlang.ast.mir.MidIrStatement.Label
import samlang.ast.mir.MidIrStatement.MoveMem
import samlang.ast.mir.MidIrStatement.MoveTemp
import samlang.ast.mir.MidIrStatement.Return

/**
 * The utility class that extracts sub-expressions.
 * Primitives like constant and temporaries are not considered as expressions here.
 */
internal object SubExpressionExtractor {
    /**
     * @param statement the statement to extract all subexpressions.
     * @return the extracted set of sub-expressions.
     */
    fun get(statement: MidIrStatement): Set<MidIrExpression> = StatementVisitor(statement).expressions

    private class StatementVisitor(statement: MidIrStatement) : MidIrLoweredStatementVisitor<Unit, Unit> {
        val expressions: MutableSet<MidIrExpression> = mutableSetOf()

        init {
            statement.accept(this, Unit)
        }

        private fun addAll(expression: MidIrExpression) {
            expressions.addAll(ExprVisitor(expression).expressions)
        }

        override fun visit(node: MoveTemp, context: Unit): Unit = addAll(expression = node.source)

        override fun visit(node: MoveMem, context: Unit) {
            addAll(expression = node.memLocation)
            addAll(expression = node.source)
        }

        override fun visit(node: MidIrStatement.CallFunction, context: Unit): Unit =
            node.arguments.forEach { addAll(it) }

        override fun visit(node: Jump, context: Unit): Unit = Unit
        override fun visit(node: ConditionalJumpFallThrough, context: Unit): Unit = addAll(expression = node.condition)
        override fun visit(node: Label, context: Unit): Unit = Unit

        override fun visit(node: Return, context: Unit) {
            node.returnedExpression?.let { addAll(expression = it) }
        }
    }

    private class ExprVisitor(irExpression: MidIrExpression) : MidIrExpressionVisitor<Unit, Unit> {
        val expressions: MutableSet<MidIrExpression> = mutableSetOf()

        init {
            irExpression.accept(visitor = this, context = Unit)
        }

        override fun visit(node: Constant, context: Unit): Unit = Unit
        override fun visit(node: Name, context: Unit): Unit = Unit
        override fun visit(node: Temporary, context: Unit): Unit = Unit

        override fun visit(node: Op, context: Unit) {
            expressions += node
            node.e1.accept(visitor = this, context = Unit)
            node.e2.accept(visitor = this, context = Unit)
        }

        override fun visit(node: Mem, context: Unit) {
            expressions += node
            node.expression.accept(visitor = this, context = Unit)
        }
    }
}
