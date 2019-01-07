package samlang.ast.raw

/**
 * Generic visitor for raw type expression node.
 * Each method requires a specific node and a context of type C to produce a result of type T.
 *
 * @param C type of the context during visit.
 * @param T type of the visitor return value.
 */
interface RawTypeExprVisitor<in C, out T> {
    fun visit(typeExpr: RawTypeExpr.UnitType, context: C): T
    fun visit(typeExpr: RawTypeExpr.IntType, context: C): T
    fun visit(typeExpr: RawTypeExpr.StringType, context: C): T
    fun visit(typeExpr: RawTypeExpr.BoolType, context: C): T
    fun visit(typeExpr: RawTypeExpr.IdentifierType, context: C): T
    fun visit(typeExpr: RawTypeExpr.TupleType, context: C): T
    fun visit(typeExpr: RawTypeExpr.FunctionType, context: C): T
}
