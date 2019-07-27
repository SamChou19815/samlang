package samlang.checker

import samlang.ast.lang.ExpressionVisitor
import samlang.ast.lang.Expression
import samlang.ast.lang.Expression.Binary
import samlang.ast.lang.Expression.FieldAccess
import samlang.ast.lang.Expression.FunctionApplication
import samlang.ast.lang.Expression.IfElse
import samlang.ast.lang.Expression.Lambda
import samlang.ast.lang.Expression.Literal
import samlang.ast.lang.Expression.Match
import samlang.ast.lang.Expression.MethodAccess
import samlang.ast.lang.Expression.ModuleMember
import samlang.ast.lang.Expression.ObjectConstructor
import samlang.ast.lang.Expression.Panic
import samlang.ast.lang.Expression.This
import samlang.ast.lang.Expression.TupleConstructor
import samlang.ast.lang.Expression.Unary
import samlang.ast.lang.Expression.Val
import samlang.ast.lang.Expression.Variable
import samlang.ast.lang.Expression.VariantConstructor
import samlang.ast.lang.Type

internal interface TypeCheckerVisitor :
    ExpressionVisitor<Pair<TypeCheckingContext, Type>, Expression> {

    @JvmDefault
    override fun visit(expression: Literal, context: Pair<TypeCheckingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: This, context: Pair<TypeCheckingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: Variable, context: Pair<TypeCheckingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: ModuleMember, context: Pair<TypeCheckingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: TupleConstructor, context: Pair<TypeCheckingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: ObjectConstructor, context: Pair<TypeCheckingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: VariantConstructor, context: Pair<TypeCheckingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: FieldAccess, context: Pair<TypeCheckingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: MethodAccess, context: Pair<TypeCheckingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: Unary, context: Pair<TypeCheckingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: Panic, context: Pair<TypeCheckingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(
        expression: FunctionApplication,
        context: Pair<TypeCheckingContext, Type>
    ): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: Binary, context: Pair<TypeCheckingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: IfElse, context: Pair<TypeCheckingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: Match, context: Pair<TypeCheckingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: Lambda, context: Pair<TypeCheckingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: Val, context: Pair<TypeCheckingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    fun visit(expression: Literal, ctx: TypeCheckingContext, expectedType: Type): Expression
    fun visit(expression: This, ctx: TypeCheckingContext, expectedType: Type): Expression
    fun visit(expression: Variable, ctx: TypeCheckingContext, expectedType: Type): Expression
    fun visit(expression: ModuleMember, ctx: TypeCheckingContext, expectedType: Type): Expression
    fun visit(expression: TupleConstructor, ctx: TypeCheckingContext, expectedType: Type): Expression
    fun visit(expression: ObjectConstructor, ctx: TypeCheckingContext, expectedType: Type): Expression
    fun visit(expression: VariantConstructor, ctx: TypeCheckingContext, expectedType: Type): Expression
    fun visit(expression: FieldAccess, ctx: TypeCheckingContext, expectedType: Type): Expression
    fun visit(expression: MethodAccess, ctx: TypeCheckingContext, expectedType: Type): Expression
    fun visit(expression: Unary, ctx: TypeCheckingContext, expectedType: Type): Expression
    fun visit(expression: Panic, ctx: TypeCheckingContext, expectedType: Type): Expression
    fun visit(expression: FunctionApplication, ctx: TypeCheckingContext, expectedType: Type): Expression
    fun visit(expression: Binary, ctx: TypeCheckingContext, expectedType: Type): Expression
    fun visit(expression: IfElse, ctx: TypeCheckingContext, expectedType: Type): Expression
    fun visit(expression: Match, ctx: TypeCheckingContext, expectedType: Type): Expression
    fun visit(expression: Lambda, ctx: TypeCheckingContext, expectedType: Type): Expression
    fun visit(expression: Val, ctx: TypeCheckingContext, expectedType: Type): Expression
}
