package samlang.checker

import samlang.ast.CheckedExprVisitor
import samlang.ast.Expression
import samlang.ast.Expression.*
import samlang.ast.Type

internal interface TypeCheckerVisitor :
    CheckedExprVisitor<Pair<TypeCheckingContext, Type>, Expression> {

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
