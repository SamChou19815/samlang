package samlang.ast.ts

import samlang.ast.common.BinaryOperator
import samlang.ast.common.Type
import samlang.ast.common.UnaryOperator

/**
 * @property precedence precedence level. Lower the level, higher the precedence.
 */
sealed class TsExpression(val precedence: Int) {
    data class Literal(val literal: samlang.ast.common.Literal) : TsExpression(precedence = 0)

    data class Variable(val name: String) : TsExpression(precedence = 0)

    data class ClassMember(val className: String, val memberName: String) : TsExpression(precedence = 0)

    data class TupleConstructor(val expressionList: List<TsExpression>) : TsExpression(precedence = 1)

    data class ObjectConstructor(
        val spreadExpression: TsExpression?,
        val fieldDeclaration: List<Pair<String, TsExpression>>
    ) : TsExpression(precedence = 1)

    data class VariantConstructor(val tag: String, val data: TsExpression) : TsExpression(precedence = 1)

    data class FieldAccess(val expression: TsExpression, val fieldName: String) : TsExpression(precedence = 1)

    data class MethodAccess(val expression: TsExpression, val methodName: String) : TsExpression(precedence = 2)

    data class Unary(val operator: UnaryOperator, val expression: TsExpression) : TsExpression(precedence = 3)

    data class FunctionApplication(val functionExpression: TsExpression, val arguments: List<TsExpression>) :
        TsExpression(precedence = 4)

    data class Binary(val e1: TsExpression, val operator: BinaryOperator, val e2: TsExpression) :
        TsExpression(precedence = 5 + operator.precedence)

    data class Ternary(val boolExpression: TsExpression, val e1: TsExpression, val e2: TsExpression) :
        TsExpression(precedence = 10)

    data class Lambda(val parameters: List<Pair<String, Type>>, val body: List<TsStatement>) :
        TsExpression(precedence = 11)
}
