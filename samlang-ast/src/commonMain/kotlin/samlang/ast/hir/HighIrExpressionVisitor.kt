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
    fun visit(expression: HighIrExpression.ClassMember): T
    fun visit(expression: HighIrExpression.StructConstructor): T
    fun visit(expression: HighIrExpression.VariantConstructor): T
    fun visit(expression: HighIrExpression.IndexAccess): T
    fun visit(expression: HighIrExpression.MethodAccess): T
    fun visit(expression: HighIrExpression.Unary): T
    fun visit(expression: HighIrExpression.BuiltInFunctionApplication): T
    fun visit(expression: HighIrExpression.FunctionApplication): T
    fun visit(expression: HighIrExpression.MethodApplication): T
    fun visit(expression: HighIrExpression.ClosureApplication): T
    fun visit(expression: HighIrExpression.Binary): T
    fun visit(expression: HighIrExpression.Lambda): T
}
