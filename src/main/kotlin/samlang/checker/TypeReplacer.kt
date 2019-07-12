package samlang.checker

import samlang.ast.CheckedExprVisitor
import samlang.ast.Expression
import samlang.ast.Expression.Binary
import samlang.ast.Expression.FieldAccess
import samlang.ast.Expression.FunctionApplication
import samlang.ast.Expression.IfElse
import samlang.ast.Expression.Lambda
import samlang.ast.Expression.Literal
import samlang.ast.Expression.Match
import samlang.ast.Expression.MethodAccess
import samlang.ast.Expression.ModuleMember
import samlang.ast.Expression.ObjectConstructor
import samlang.ast.Expression.Panic
import samlang.ast.Expression.This
import samlang.ast.Expression.TupleConstructor
import samlang.ast.Expression.Unary
import samlang.ast.Expression.Val
import samlang.ast.Expression.Variable
import samlang.ast.Expression.VariantConstructor
import samlang.ast.Type

internal fun Expression.replaceTypeWithExpectedType(expectedType: Type): Expression =
    this.accept(visitor = TypeReplacerVisitor, context = expectedType)

private object TypeReplacerVisitor : CheckedExprVisitor<Type, Expression> {
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
