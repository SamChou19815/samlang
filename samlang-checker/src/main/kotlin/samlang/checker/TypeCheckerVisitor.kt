package samlang.checker

import samlang.ast.common.Type
import samlang.ast.lang.Expression
import samlang.ast.lang.Expression.Binary
import samlang.ast.lang.Expression.ClassMember
import samlang.ast.lang.Expression.FieldAccess
import samlang.ast.lang.Expression.FunctionApplication
import samlang.ast.lang.Expression.IfElse
import samlang.ast.lang.Expression.Lambda
import samlang.ast.lang.Expression.Literal
import samlang.ast.lang.Expression.Match
import samlang.ast.lang.Expression.MethodAccess
import samlang.ast.lang.Expression.ObjectConstructor
import samlang.ast.lang.Expression.Panic
import samlang.ast.lang.Expression.This
import samlang.ast.lang.Expression.TupleConstructor
import samlang.ast.lang.Expression.Unary
import samlang.ast.lang.Expression.Val
import samlang.ast.lang.Expression.Variable
import samlang.ast.lang.Expression.VariantConstructor
import samlang.ast.lang.ExpressionVisitor

internal interface TypeCheckerVisitor :
    ExpressionVisitor<Pair<LocalTypingContext, Type>, Expression> {

    @JvmDefault
    override fun visit(expression: Literal, context: Pair<LocalTypingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: This, context: Pair<LocalTypingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: Variable, context: Pair<LocalTypingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: ClassMember, context: Pair<LocalTypingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: TupleConstructor, context: Pair<LocalTypingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: ObjectConstructor, context: Pair<LocalTypingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: VariantConstructor, context: Pair<LocalTypingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: FieldAccess, context: Pair<LocalTypingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: MethodAccess, context: Pair<LocalTypingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: Unary, context: Pair<LocalTypingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: Panic, context: Pair<LocalTypingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(
        expression: FunctionApplication,
        context: Pair<LocalTypingContext, Type>
    ): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: Binary, context: Pair<LocalTypingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: IfElse, context: Pair<LocalTypingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: Match, context: Pair<LocalTypingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: Lambda, context: Pair<LocalTypingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    @JvmDefault
    override fun visit(expression: Val, context: Pair<LocalTypingContext, Type>): Expression =
        visit(expression = expression, ctx = context.first, expectedType = context.second)

    fun visit(expression: Literal, ctx: LocalTypingContext, expectedType: Type): Expression
    fun visit(expression: This, ctx: LocalTypingContext, expectedType: Type): Expression
    fun visit(expression: Variable, ctx: LocalTypingContext, expectedType: Type): Expression
    fun visit(expression: ClassMember, ctx: LocalTypingContext, expectedType: Type): Expression
    fun visit(expression: TupleConstructor, ctx: LocalTypingContext, expectedType: Type): Expression
    fun visit(expression: ObjectConstructor, ctx: LocalTypingContext, expectedType: Type): Expression
    fun visit(expression: VariantConstructor, ctx: LocalTypingContext, expectedType: Type): Expression
    fun visit(expression: FieldAccess, ctx: LocalTypingContext, expectedType: Type): Expression
    fun visit(expression: MethodAccess, ctx: LocalTypingContext, expectedType: Type): Expression
    fun visit(expression: Unary, ctx: LocalTypingContext, expectedType: Type): Expression
    fun visit(expression: Panic, ctx: LocalTypingContext, expectedType: Type): Expression
    fun visit(expression: FunctionApplication, ctx: LocalTypingContext, expectedType: Type): Expression
    fun visit(expression: Binary, ctx: LocalTypingContext, expectedType: Type): Expression
    fun visit(expression: IfElse, ctx: LocalTypingContext, expectedType: Type): Expression
    fun visit(expression: Match, ctx: LocalTypingContext, expectedType: Type): Expression
    fun visit(expression: Lambda, ctx: LocalTypingContext, expectedType: Type): Expression
    fun visit(expression: Val, ctx: LocalTypingContext, expectedType: Type): Expression
}
