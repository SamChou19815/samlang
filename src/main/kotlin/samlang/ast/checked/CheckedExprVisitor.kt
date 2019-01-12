package samlang.ast.checked

/**
 * Generic visitor for type-checked expression node.
 * Each method requires a specific node and a context of type C to produce a result of type T.
 *
 * @param C type of the context during visit.
 * @param T type of the visitor return value.
 */
internal interface CheckedExprVisitor<in C, out T> {
    fun visit(expr: CheckedExpr.Literal, context: C): T
    fun visit(expr: CheckedExpr.This, context: C): T
    fun visit(expr: CheckedExpr.Variable, context: C): T
    fun visit(expr: CheckedExpr.ModuleMember, context: C): T
    fun visit(expr: CheckedExpr.TupleConstructor, context: C): T
    fun visit(expr: CheckedExpr.ObjectConstructor, context: C): T
    fun visit(expr: CheckedExpr.VariantConstructor, context: C): T
    fun visit(expr: CheckedExpr.FieldAccess, context: C): T
    fun visit(expr: CheckedExpr.MethodAccess, context: C): T
    fun visit(expr: CheckedExpr.Unary, context: C): T
    fun visit(expr: CheckedExpr.Panic, context: C): T
    fun visit(expr: CheckedExpr.FunApp, context: C): T
    fun visit(expr: CheckedExpr.Binary, context: C): T
    fun visit(expr: CheckedExpr.IfElse, context: C): T
    fun visit(expr: CheckedExpr.Match, context: C): T
    fun visit(expr: CheckedExpr.Lambda, context: C): T
    fun visit(expr: CheckedExpr.Val, context: C): T
}
