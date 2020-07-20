package samlang.ast.hir

/**
 * Generic visitor for IR expression node.
 * Each method requires a specific node to produce a result of type T.
 *
 * @param T type of the visitor return value.
 */
interface HighIrExpressionVisitor<T> {
    fun visit(expression: HighIrExpression.Literal): T
    fun visit(expression: HighIrExpression.Variable): T
    fun visit(expression: HighIrExpression.StructConstructor): T
    fun visit(expression: HighIrExpression.IndexAccess): T
    fun visit(expression: HighIrExpression.FunctionClosure): T
    fun visit(expression: HighIrExpression.Binary): T
}
