package samlang.optimization

import samlang.ast.common.IrOperator
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Companion.CONST
import samlang.ast.mir.MidIrExpression.Companion.OP
import samlang.ast.mir.MidIrExpression.Constant
import samlang.ast.mir.MidIrExpression.Mem
import samlang.ast.mir.MidIrExpression.Name
import samlang.ast.mir.MidIrExpression.Op
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrExpressionVisitor
import samlang.ast.mir.MidIrLoweredStatementVisitor
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.CallFunction
import samlang.ast.mir.MidIrStatement.Companion.CJUMP_FALLTHROUGH
import samlang.ast.mir.MidIrStatement.ConditionalJumpFallThrough
import samlang.ast.mir.MidIrStatement.Jump
import samlang.ast.mir.MidIrStatement.Label
import samlang.ast.mir.MidIrStatement.MoveMem
import samlang.ast.mir.MidIrStatement.MoveTemp
import samlang.ast.mir.MidIrStatement.Return

internal object ConstantFolder {
    fun optimize(statements: List<MidIrStatement>): List<MidIrStatement> =
        statements.mapNotNull { fold(statement = it) }

    private fun fold(statement: MidIrStatement): MidIrStatement? = statement.accept(StatementFolder, Unit)

    fun fold(expression: MidIrExpression): MidIrExpression = expression.accept(ExpressionFolder, Unit)

    private object StatementFolder : MidIrLoweredStatementVisitor<Unit, MidIrStatement?> {
        override fun visit(node: MoveTemp, context: Unit): MidIrStatement =
            node.copy(tempId = node.tempId, source = fold(node.source))

        override fun visit(node: MoveMem, context: Unit): MidIrStatement =
            node.copy(memLocation = fold(node.memLocation), source = fold(node.source))

        override fun visit(node: CallFunction, context: Unit): MidIrStatement =
            node.copy(
                functionExpr = fold(node.functionExpr),
                arguments = node.arguments.map { fold(it) },
                returnCollector = node.returnCollector
            )

        override fun visit(node: Jump, context: Unit): MidIrStatement = node

        override fun visit(node: ConditionalJumpFallThrough, context: Unit): MidIrStatement? {
            val condition = fold(node.condition)
            if (condition is Constant) {
                val constantValue = condition.value
                if (constantValue == 1L) {
                    return Jump(node.label1)
                } else if (constantValue == 0L) {
                    return null
                }
            }
            return CJUMP_FALLTHROUGH(condition, node.label1)
        }

        override fun visit(node: Label, context: Unit): MidIrStatement = node

        override fun visit(node: Return, context: Unit): MidIrStatement =
            Return(returnedExpression = node.returnedExpression?.let { fold(it) })
    }

    private object ExpressionFolder : MidIrExpressionVisitor<Unit, MidIrExpression> {
        override fun visit(node: Constant, context: Unit): MidIrExpression = node
        override fun visit(node: Name, context: Unit): MidIrExpression = node
        override fun visit(node: Temporary, context: Unit): MidIrExpression = node

        private fun foldOp(v1: Long, v2: Long, op: IrOperator): Constant? {
            return if ((op === IrOperator.DIV || op === IrOperator.MOD) && v2 == 0L) {
                null
            } else when (op) {
                IrOperator.ADD -> CONST(value = v1 + v2)
                IrOperator.SUB -> CONST(value = v1 - v2)
                IrOperator.MUL -> CONST(value = v1 * v2)
                IrOperator.DIV -> CONST(value = v1 / v2)
                IrOperator.MOD -> CONST(value = v1 % v2)
                IrOperator.EQ -> if (v1 == v2) CONST(value = 1) else CONST(value = 0)
                IrOperator.NE -> if (v1 != v2) CONST(value = 1) else CONST(value = 0)
                IrOperator.GE -> if (v1 >= v2) CONST(value = 1) else CONST(value = 0)
                IrOperator.GT -> if (v1 > v2) CONST(value = 1) else CONST(value = 0)
                IrOperator.LE -> if (v1 <= v2) CONST(value = 1) else CONST(value = 0)
                IrOperator.LT -> if (v1 < v2) CONST(value = 1) else CONST(value = 0)
                IrOperator.XOR -> CONST(value = v1 xor v2)
            }
        }

        override fun visit(node: Op, context: Unit): MidIrExpression {
            val e1 = fold(node.e1)
            val e2 = fold(node.e2)
            val op = node.operator
            if (e1 is Constant && e2 is Constant) {
                val c = foldOp(e1.value, e2.value, op)
                if (c != null) {
                    return c
                }
            }
            return OP(op = op, e1 = e1, e2 = e2)
        }

        override fun visit(node: Mem, context: Unit): MidIrExpression =
            node.copy(expression = fold(node.expression))
    }
}
