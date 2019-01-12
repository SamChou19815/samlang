package samlang.ast.raw

/**
 * Generic visitor for raw expression node.
 * Each method requires a specific node and a context of type C to produce a result of type T.
 *
 * @param C type of the context during visit.
 * @param T type of the visitor return value.
 */
interface RawExprVisitor<in C, out T> {
    fun visit(expr: RawExpr.Literal, context: C): T
    fun visit(expr: RawExpr.This, context: C): T
    fun visit(expr: RawExpr.Variable, context: C): T
    fun visit(expr: RawExpr.ModuleMember, context: C): T
    fun visit(expr: RawExpr.TupleConstructor, context: C): T
    fun visit(expr: RawExpr.ObjectConstructor, context: C): T
    fun visit(expr: RawExpr.VariantConstructor, context: C): T
    fun visit(expr: RawExpr.FieldAccess, context: C): T
    fun visit(expr: RawExpr.MethodAccess, context: C): T
    fun visit(expr: RawExpr.Unary, context: C): T
    fun visit(expr: RawExpr.Panic, context: C): T
    fun visit(expr: RawExpr.FunApp, context: C): T
    fun visit(expr: RawExpr.Binary, context: C): T
    fun visit(expr: RawExpr.IfElse, context: C): T
    fun visit(expr: RawExpr.Match, context: C): T
    fun visit(expr: RawExpr.Lambda, context: C): T
    fun visit(expr: RawExpr.Val, context: C): T
}
