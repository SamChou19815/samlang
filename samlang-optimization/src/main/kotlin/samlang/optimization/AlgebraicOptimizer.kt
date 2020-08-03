package samlang.optimization

import samlang.ast.common.IrOperator
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Companion.ONE
import samlang.ast.mir.MidIrExpression.Companion.OP
import samlang.ast.mir.MidIrExpression.Companion.ZERO
import samlang.ast.mir.MidIrExpression.Constant
import samlang.ast.mir.MidIrExpression.Mem
import samlang.ast.mir.MidIrExpression.Name
import samlang.ast.mir.MidIrExpression.Op
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrExpressionVisitor
import samlang.ast.mir.MidIrLoweredStatementVisitor
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.CallFunction
import samlang.ast.mir.MidIrStatement.ConditionalJumpFallThrough
import samlang.ast.mir.MidIrStatement.Jump
import samlang.ast.mir.MidIrStatement.Label
import samlang.ast.mir.MidIrStatement.MoveMem
import samlang.ast.mir.MidIrStatement.MoveTemp
import samlang.ast.mir.MidIrStatement.Return

internal object AlgebraicOptimizer {
    fun optimize(statements: List<MidIrStatement>): List<MidIrStatement> =
        statements.map { optimize(statement = it) }

    private fun optimize(statement: MidIrStatement): MidIrStatement =
        statement.accept(StatementOptimizer, Unit)

    private fun optimize(expression: MidIrExpression): MidIrExpression =
        expression.accept(ExpressionOptimizer, Unit)

    private object StatementOptimizer : MidIrLoweredStatementVisitor<Unit, MidIrStatement> {
        override fun visit(node: MoveTemp, context: Unit): MidIrStatement =
            node.copy(node.tempId, optimize(node.source))

        override fun visit(node: MoveMem, context: Unit): MidIrStatement =
            node.copy(optimize(node.memLocation), optimize(node.source))

        override fun visit(node: CallFunction, context: Unit): MidIrStatement =
            node.copy(
                functionExpr = optimize(expression = node.functionExpr),
                arguments = node.arguments.map { optimize(expression = it) },
                returnCollector = node.returnCollector
            )

        override fun visit(node: Jump, context: Unit): MidIrStatement = node

        override fun visit(node: ConditionalJumpFallThrough, context: Unit): MidIrStatement =
            node.copy(condition = optimize(expression = node.condition), label1 = node.label1)

        override fun visit(node: Label, context: Unit): MidIrStatement = node

        override fun visit(node: Return, context: Unit): MidIrStatement = node.copy(
            returnedExpression = node.returnedExpression?.let { optimize(it) }
        )
    }

    private object ExpressionOptimizer : MidIrExpressionVisitor<Unit, MidIrExpression> {
        override fun visit(node: Constant, context: Unit): MidIrExpression = node
        override fun visit(node: Name, context: Unit): MidIrExpression = node
        override fun visit(node: Temporary, context: Unit): MidIrExpression = node

        override fun visit(node: Op, context: Unit): MidIrExpression {
            val e1 = optimize(node.e1)
            val e2 = optimize(node.e2)
            return when {
                e1 is Constant -> {
                    if (e1 == ZERO) {
                        return when (node.operator) {
                            IrOperator.ADD, IrOperator.XOR -> e2
                            else -> OP(node.operator, e1, e2)
                        }
                    }
                    if (e1 == ONE) {
                        return if (node.operator === IrOperator.MUL) e2 else OP(node.operator, e1, e2)
                    }
                    OP(node.operator, e1, e2)
                }
                e2 is Constant -> {
                    if (e2 == ZERO) {
                        return when (node.operator) {
                            IrOperator.ADD, IrOperator.SUB, IrOperator.XOR -> e1
                            else -> OP(node.operator, e1, e2)
                        }
                    }
                    if (e2 == ONE) {
                        return if (node.operator === IrOperator.MUL) e1 else OP(node.operator, e1, e2)
                    }
                    OP(node.operator, e1, e2)
                }
                else -> OP(node.operator, e1, e2)
            }
        }

        override fun visit(node: Mem, context: Unit): MidIrExpression =
            node.copy(expression = optimize(expression = node.expression))
    }
}
