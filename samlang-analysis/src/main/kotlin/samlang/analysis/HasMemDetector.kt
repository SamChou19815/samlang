package samlang.analysis

import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrLoweredExpressionVisitor

/** The detector utility class for finding mem since they are dangerous. */
internal object HasMemDetector {
    @JvmStatic
    fun hasMem(expression: MidIrExpression): Boolean = expression.accept(visitor = Visitor, context = Unit)

    private object Visitor : MidIrLoweredExpressionVisitor<Unit, Boolean> {
        override fun visit(node: MidIrExpression.Constant, context: Unit): Boolean = false
        override fun visit(node: MidIrExpression.Name, context: Unit): Boolean = false
        override fun visit(node: MidIrExpression.Temporary, context: Unit): Boolean = false
        override fun visit(node: MidIrExpression.Op, context: Unit): Boolean = hasMem(node.e1) || hasMem(node.e2)
        override fun visit(node: MidIrExpression.Mem, context: Unit): Boolean = true
    }
}
