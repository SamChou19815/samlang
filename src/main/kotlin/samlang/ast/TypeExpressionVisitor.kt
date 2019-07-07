package samlang.ast

/**
 * Generic visitor for type-checked type expression node.
 * Each method requires a specific node and a context of type C to produce a result of type T.
 *
 * @param C type of the context during visit.
 * @param T type of the visitor return value.
 */
interface TypeExpressionVisitor<in C, out T> {
    fun visit(typeExpression: TypeExpression.UnitType, context: C): T
    fun visit(typeExpression: TypeExpression.IntType, context: C): T
    fun visit(typeExpression: TypeExpression.StringType, context: C): T
    fun visit(typeExpression: TypeExpression.BoolType, context: C): T
    fun visit(typeExpression: TypeExpression.IdentifierType, context: C): T
    fun visit(typeExpression: TypeExpression.TupleType, context: C): T
    fun visit(typeExpression: TypeExpression.FunctionType, context: C): T
    fun visit(typeExpression: TypeExpression.UndecidedType, context: C): T
}
