package samlang.ast.ir

/**
 * Generic visitor for IR expression node.
 * Each method requires a specific node to produce a result of type T.
 *
 * @param T type of the visitor return value.
 */
interface IrExpressionVisitor<T> {
    fun visit(expression: IrExpression.Never): T
    fun visit(expression: IrExpression.Literal): T
    fun visit(expression: IrExpression.Variable): T
    fun visit(expression: IrExpression.This): T
    fun visit(expression: IrExpression.ClassMember): T
    fun visit(expression: IrExpression.TupleConstructor): T
    fun visit(expression: IrExpression.ObjectConstructor): T
    fun visit(expression: IrExpression.VariantConstructor): T
    fun visit(expression: IrExpression.FieldAccess): T
    fun visit(expression: IrExpression.MethodAccess): T
    fun visit(expression: IrExpression.Unary): T
    fun visit(expression: IrExpression.FunctionApplication): T
    fun visit(expression: IrExpression.Binary): T
    fun visit(expression: IrExpression.Ternary): T
    fun visit(expression: IrExpression.Lambda): T
}
