package samlang.checker

import samlang.ast.lang.CheckedExprVisitor
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

internal fun Expression.replaceTypeWithExpectedType(expectedType: Type): Expression =
    this.accept(visitor = TypeReplacerVisitor, context = expectedType)

private object TypeReplacerVisitor :
    CheckedExprVisitor<Type, Expression> {
    override fun visit(expression: Literal, context: Type): Expression = expression.copy(type = context)
    override fun visit(expression: This, context: Type): Expression = expression.copy(type = context)
    override fun visit(expression: Variable, context: Type): Expression = expression.copy(type = context)
    override fun visit(expression: ModuleMember, context: Type): Expression = expression.copy(type = context)
    override fun visit(expression: TupleConstructor, context: Type): Expression =
        if (context is Type.TupleType) expression.copy(type = context) else expression

    override fun visit(expression: ObjectConstructor, context: Type): Expression = expression.copy(type = context)
    override fun visit(expression: VariantConstructor, context: Type): Expression = expression.copy(type = context)
    override fun visit(expression: FieldAccess, context: Type): Expression = expression.copy(type = context)
    override fun visit(expression: MethodAccess, context: Type): Expression = expression.copy(type = context)
    override fun visit(expression: Unary, context: Type): Expression = expression.copy(type = context)
    override fun visit(expression: Panic, context: Type): Expression = expression.copy(type = context)
    override fun visit(expression: FunctionApplication, context: Type): Expression = expression.copy(type = context)
    override fun visit(expression: Binary, context: Type): Expression = expression.copy(type = context)
    override fun visit(expression: IfElse, context: Type): Expression = expression.copy(type = context)
    override fun visit(expression: Match, context: Type): Expression = expression.copy(type = context)
    override fun visit(expression: Lambda, context: Type): Expression =
        if (context is Type.FunctionType) expression.copy(type = context) else expression

    override fun visit(expression: Val, context: Type): Expression = expression.copy(type = context)
}
