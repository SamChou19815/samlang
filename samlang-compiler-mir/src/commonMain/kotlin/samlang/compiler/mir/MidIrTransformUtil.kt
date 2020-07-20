package samlang.compiler.mir

import samlang.ast.common.IrOperator
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Companion.EQ
import samlang.ast.mir.MidIrExpression.Companion.GE
import samlang.ast.mir.MidIrExpression.Companion.GT
import samlang.ast.mir.MidIrExpression.Companion.LE
import samlang.ast.mir.MidIrExpression.Companion.LT
import samlang.ast.mir.MidIrExpression.Companion.NE
import samlang.ast.mir.MidIrExpression.Companion.ONE
import samlang.ast.mir.MidIrExpression.Companion.XOR
import samlang.ast.mir.MidIrExpression.Name
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrLoweredExpressionVisitor

object MidIrTransformUtil {
    /**
     * Invert the condition in the most efficient way.
     *
     * @param expression the condition expression to invert.
     * @return the inverted condition expression.
     */
    fun invertCondition(expression: MidIrExpression): MidIrExpression {
        return expression.accept(IrExprInverterVisitor, Unit)
    }

    private object IrExprInverterVisitor : MidIrLoweredExpressionVisitor<Unit, MidIrExpression> {
        override fun visit(node: MidIrExpression.Constant, context: Unit): MidIrExpression {
            val value = node.value
            if (value == 0L) {
                return ONE
            } else if (value == 1L) {
                return MidIrExpression.ZERO
            }
            error(message = "Node $node cannot be inverted")
        }

        override fun visit(node: Name, context: Unit): MidIrExpression =
            XOR(e1 = node, e2 = ONE) // not statically decidable, simply apply NOT.

        override fun visit(node: Temporary, context: Unit): MidIrExpression =
            XOR(e1 = node, e2 = ONE) // not statically decidable, simply apply NOT.

        override fun visit(node: MidIrExpression.Op, context: Unit): MidIrExpression {
            val e1 = node.e1
            val e2 = node.e2
            return when (node.operator) {
                IrOperator.MUL, IrOperator.DIV, IrOperator.MOD,
                IrOperator.ADD, IrOperator.SUB -> error(message = "Node $node cannot be inverted")
                IrOperator.XOR -> {
                    if (e1 is MidIrExpression.Constant && e1.value == ONE.value) {
                        return e2
                    }
                    if (e2 is MidIrExpression.Constant && e2.value == ONE.value) {
                        e1
                    } else {
                        XOR(e1 = node, e2 = ONE)
                    }
                }
                IrOperator.OR, IrOperator.AND -> XOR(e1 = node, e2 = ONE)
                IrOperator.LT -> GE(e1 = e1, e2 = e2)
                IrOperator.LE -> GT(e1 = e1, e2 = e2)
                IrOperator.GT -> LE(e1 = e1, e2 = e2)
                IrOperator.GE -> LT(e1 = e1, e2 = e2)
                IrOperator.EQ -> NE(e1 = e1, e2 = e2)
                IrOperator.NE -> EQ(e1 = e1, e2 = e2)
            }
        }

        override fun visit(node: MidIrExpression.Mem, context: Unit): MidIrExpression =
            XOR(e1 = node, e2 = ONE) // not statically decidable, simply apply NOT.
    }
}
