package samlang.ast

/**
 * Generic visitor for type-checked expression node.
 * Each method requires a specific node and a context of type C to produce a result of type T.
 *
 * @param C type of the context during visit.
 * @param T type of the visitor return value.
 */
internal interface CheckedExprVisitor<in C, out T> {
    fun visit(expression: Expression.Literal, context: C): T
    fun visit(expression: Expression.This, context: C): T
    fun visit(expression: Expression.Variable, context: C): T
    fun visit(expression: Expression.ModuleMember, context: C): T
    fun visit(expression: Expression.TupleConstructor, context: C): T
    fun visit(expression: Expression.ObjectConstructor, context: C): T
    fun visit(expression: Expression.VariantConstructor, context: C): T
    fun visit(expression: Expression.FieldAccess, context: C): T
    fun visit(expression: Expression.MethodAccess, context: C): T
    fun visit(expression: Expression.Unary, context: C): T
    fun visit(expression: Expression.Panic, context: C): T
    fun visit(expression: Expression.FunctionApplication, context: C): T
    fun visit(expression: Expression.Binary, context: C): T
    fun visit(expression: Expression.IfElse, context: C): T
    fun visit(expression: Expression.Match, context: C): T
    fun visit(expression: Expression.Lambda, context: C): T
    fun visit(expression: Expression.Val, context: C): T
}
