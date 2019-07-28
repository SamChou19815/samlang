package samlang.ast.ir

import samlang.ast.common.BinaryOperator
import samlang.ast.common.Type
import samlang.ast.common.UnaryOperator

/**
 * A collection of expressions for common IR.
 *
 * @property precedence precedence level. Lower the level, higher the precedence.
 */
sealed class IrExpression(val precedence: Int) {
    data class Literal(val literal: samlang.ast.common.Literal) : IrExpression(precedence = 0)

    data class Variable(val name: String) : IrExpression(precedence = 0)

    data class ClassMember(val className: String, val memberName: String) : IrExpression(precedence = 0)

    data class TupleConstructor(val expressionList: List<IrExpression>) : IrExpression(precedence = 1)

    data class ObjectConstructor(
        val spreadExpression: IrExpression?,
        val fieldDeclaration: List<Pair<String, IrExpression>>
    ) : IrExpression(precedence = 1)

    data class VariantConstructor(val tag: String, val data: IrExpression) : IrExpression(precedence = 1)

    data class FieldAccess(val expression: IrExpression, val fieldName: String) : IrExpression(precedence = 1)

    data class MethodAccess(val expression: IrExpression, val methodName: String) : IrExpression(precedence = 2)

    data class Unary(val operator: UnaryOperator, val expression: IrExpression) : IrExpression(precedence = 3)

    data class FunctionApplication(val functionExpression: IrExpression, val arguments: List<IrExpression>) :
        IrExpression(precedence = 4)

    data class Binary(val e1: IrExpression, val operator: BinaryOperator, val e2: IrExpression) :
        IrExpression(precedence = 5 + operator.precedence)

    data class Ternary(val boolExpression: IrExpression, val e1: IrExpression, val e2: IrExpression) :
        IrExpression(precedence = 10)

    data class Lambda(val parameters: List<Pair<String, Type>>, val body: List<IrStatement>) :
        IrExpression(precedence = 11)
}
