package samlang.analysis

import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Constant
import samlang.ast.mir.MidIrExpression.Mem
import samlang.ast.mir.MidIrExpression.Name
import samlang.ast.mir.MidIrExpression.Op
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrExpressionVisitor

/** Checker for whether the given expression contains the temporary. */
object ContainsTempDetector {
    /**
     * Check whether the given expression contains the temporary.
     *
     * @param expression the expression to check.
     * @param temporary the temporary to detect.
     * @return whether the given expression contains the temporary.
     */
    fun check(expression: MidIrExpression, temporary: Temporary): Boolean = expression.accept(
        Visitor, temporary)

    private object Visitor : MidIrExpressionVisitor<Temporary, Boolean> {
        override fun visit(node: Constant, context: Temporary): Boolean = false
        override fun visit(node: Name, context: Temporary): Boolean = false
        override fun visit(node: Temporary, context: Temporary): Boolean = node == context

        override fun visit(node: Op, context: Temporary): Boolean =
            node.e1.accept(visitor = this, context = context) || node.e2.accept(visitor = this, context = context)

        override fun visit(node: Mem, context: Temporary): Boolean =
            node.expression.accept(visitor = this, context = context)
    }
}
