package samlang.compiler.mir

import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Companion.OP_FLEX_ORDER
import samlang.ast.mir.MidIrLoweredExpressionVisitor

/** Safely reordering IR op nodes so that equivalent op also has same syntactic form. */
internal object IrOpReorderingUtil {
    @JvmStatic
    fun reorder(expression: MidIrExpression): MidIrExpression =
        expression.accept(visitor = ReorderVisitor, context = Unit)

    private object ReorderVisitor : MidIrLoweredExpressionVisitor<Unit, MidIrExpression> {
        override fun visit(node: MidIrExpression.Constant, context: Unit): MidIrExpression = node
        override fun visit(node: MidIrExpression.Name, context: Unit): MidIrExpression = node
        override fun visit(node: MidIrExpression.Temporary, context: Unit): MidIrExpression = node

        override fun visit(node: MidIrExpression.Op, context: Unit): MidIrExpression =
            OP_FLEX_ORDER(
                op = node.operator,
                e1 = node.e1.accept(visitor = this, context = Unit),
                e2 = node.e2.accept(visitor = this, context = Unit)
            )

        override fun visit(node: MidIrExpression.Mem, context: Unit): MidIrExpression =
            MidIrExpression.Mem(expression = node.expression.accept(visitor = this, context = Unit))
    }
}
