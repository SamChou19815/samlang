package samlang.ast.hir

/**
 * Generic visitor for IR expression node.
 * Each method requires a specific node to produce a result of type T.
 *
 * @param T type of the visitor return value.
 */
interface HighIrExpressionVisitor<T> {
    fun visit(expression: HighIrExpression.IntLiteral): T
    fun visit(expression: HighIrExpression.StringLiteral): T
    fun visit(expression: HighIrExpression.Name): T
    fun visit(expression: HighIrExpression.Variable): T
    fun visit(expression: HighIrExpression.IndexAccess): T
    fun visit(expression: HighIrExpression.Binary): T
}
