package samlang.ast.checked

/**
 * Generic visitor for type-checked type expression node.
 * Each method requires a specific node and a context of type C to produce a result of type T.
 *
 * @param C type of the context during visit.
 * @param T type of the visitor return value.
 */
interface CheckedTypeExprVisitor<in C, out T> {
    fun visit(typeExpr: CheckedTypeExpr.UnitType, context: C): T
    fun visit(typeExpr: CheckedTypeExpr.IntType, context: C): T
    fun visit(typeExpr: CheckedTypeExpr.StringType, context: C): T
    fun visit(typeExpr: CheckedTypeExpr.BoolType, context: C): T
    fun visit(typeExpr: CheckedTypeExpr.IdentifierType, context: C): T
    fun visit(typeExpr: CheckedTypeExpr.TupleType, context: C): T
    fun visit(typeExpr: CheckedTypeExpr.FunctionType, context: C): T
    fun visit(typeExpr: CheckedTypeExpr.UndecidedType, context: C): T
    fun visit(typeExpr: CheckedTypeExpr.FreeType, context: C): T
}
