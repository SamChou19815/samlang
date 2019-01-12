package samlang.checker

import samlang.ast.checked.CheckedExpr
import samlang.ast.checked.CheckedTypeExpr
import samlang.ast.raw.RawExpr.*
import samlang.ast.raw.RawExprVisitor

internal interface RawExprTypeCheckerVisitor : RawExprVisitor<Pair<TypeCheckingContext, CheckedTypeExpr>, CheckedExpr> {

    @JvmDefault
    override fun visit(expr: Literal, context: Pair<TypeCheckingContext, CheckedTypeExpr>): CheckedExpr =
        visit(expr = expr, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expr: This, context: Pair<TypeCheckingContext, CheckedTypeExpr>): CheckedExpr =
        visit(expr = expr, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expr: Variable, context: Pair<TypeCheckingContext, CheckedTypeExpr>): CheckedExpr =
        visit(expr = expr, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expr: ModuleMember, context: Pair<TypeCheckingContext, CheckedTypeExpr>): CheckedExpr =
        visit(expr = expr, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expr: TupleConstructor, context: Pair<TypeCheckingContext, CheckedTypeExpr>): CheckedExpr =
        visit(expr = expr, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expr: ObjectConstructor, context: Pair<TypeCheckingContext, CheckedTypeExpr>): CheckedExpr =
        visit(expr = expr, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expr: VariantConstructor, context: Pair<TypeCheckingContext, CheckedTypeExpr>): CheckedExpr =
        visit(expr = expr, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expr: FieldAccess, context: Pair<TypeCheckingContext, CheckedTypeExpr>): CheckedExpr =
        visit(expr = expr, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expr: MethodAccess, context: Pair<TypeCheckingContext, CheckedTypeExpr>): CheckedExpr =
        visit(expr = expr, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expr: Unary, context: Pair<TypeCheckingContext, CheckedTypeExpr>): CheckedExpr =
        visit(expr = expr, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expr: Panic, context: Pair<TypeCheckingContext, CheckedTypeExpr>): CheckedExpr =
        visit(expr = expr, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expr: FunApp, context: Pair<TypeCheckingContext, CheckedTypeExpr>): CheckedExpr =
        visit(expr = expr, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expr: Binary, context: Pair<TypeCheckingContext, CheckedTypeExpr>): CheckedExpr =
        visit(expr = expr, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expr: IfElse, context: Pair<TypeCheckingContext, CheckedTypeExpr>): CheckedExpr =
        visit(expr = expr, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expr: Match, context: Pair<TypeCheckingContext, CheckedTypeExpr>): CheckedExpr =
        visit(expr = expr, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expr: Lambda, context: Pair<TypeCheckingContext, CheckedTypeExpr>): CheckedExpr =
        visit(expr = expr, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expr: Val, context: Pair<TypeCheckingContext, CheckedTypeExpr>): CheckedExpr =
        visit(expr = expr, ctx = context.first, expectedType = context.second)

    fun visit(expr: Literal, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr
    fun visit(expr: This, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr
    fun visit(expr: Variable, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr
    fun visit(expr: ModuleMember, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr
    fun visit(expr: TupleConstructor, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr
    fun visit(expr: ObjectConstructor, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr
    fun visit(expr: VariantConstructor, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr
    fun visit(expr: FieldAccess, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr
    fun visit(expr: MethodAccess, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr
    fun visit(expr: Unary, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr
    fun visit(expr: Panic, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr
    fun visit(expr: FunApp, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr
    fun visit(expr: Binary, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr
    fun visit(expr: IfElse, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr
    fun visit(expr: Match, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr
    fun visit(expr: Lambda, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr
    fun visit(expr: Val, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr

}
