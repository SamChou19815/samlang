package samlang.checker

import samlang.ast.TypeExpression
import samlang.ast.TypeExpression.*
import samlang.ast.TypeExpressionVisitor

internal fun TypeExpression.validate(context: TypeCheckingContext): TypeExpression =
    accept(visitor = TypeValidator, context = context)

/**
 * A validator for type to check whether every identifier type is well defined.
 */
private object TypeValidator : TypeExpressionVisitor<TypeCheckingContext, TypeExpression> {

    override fun visit(typeExpression: UnitType, context: TypeCheckingContext): TypeExpression = typeExpression

    override fun visit(typeExpression: IntType, context: TypeCheckingContext): TypeExpression = typeExpression

    override fun visit(typeExpression: StringType, context: TypeCheckingContext): TypeExpression = typeExpression

    override fun visit(typeExpression: BoolType, context: TypeCheckingContext): TypeExpression = typeExpression

    override fun visit(typeExpression: IdentifierType, context: TypeCheckingContext): TypeExpression {
        val (range, name, typeArguments) = typeExpression
        context.checkIfIdentifierTypeIsWellDefined(
            name = name,
            typeArgLength = typeArguments?.size ?: 0,
            errorRange = range
        )
        return typeExpression.copy(typeArguments = typeArguments?.map { it.validate(context = context) })
    }

    override fun visit(typeExpression: TupleType, context: TypeCheckingContext): TypeExpression =
        typeExpression.copy(mappings = typeExpression.mappings.map { it.validate(context = context) })

    override fun visit(typeExpression: FunctionType, context: TypeCheckingContext): TypeExpression =
        typeExpression.copy(
            argumentTypes = typeExpression.argumentTypes.map { it.validate(context = context) },
            returnType = typeExpression.returnType.validate(context = context)
        )

    override fun visit(typeExpression: UndecidedType, context: TypeCheckingContext): TypeExpression = typeExpression

}
