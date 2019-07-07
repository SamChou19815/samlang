package samlang.checker

import samlang.ast.Type
import samlang.ast.Type.*
import samlang.ast.TypeVisitor

internal fun Type.validate(context: TypeCheckingContext): Type =
    accept(visitor = TypeValidator, context = context)

/**
 * A validator for type to check whether every identifier type is well defined.
 */
private object TypeValidator : TypeVisitor<TypeCheckingContext, Type> {

    override fun visit(type: PrimitiveType, context: TypeCheckingContext): Type = type

    override fun visit(type: IdentifierType, context: TypeCheckingContext): Type {
        val (range, name, typeArguments) = type
        context.checkIfIdentifierTypeIsWellDefined(
            name = name,
            typeArgLength = typeArguments?.size ?: 0,
            errorRange = range
        )
        return type.copy(typeArguments = typeArguments?.map { it.validate(context = context) })
    }

    override fun visit(type: TupleType, context: TypeCheckingContext): Type =
        type.copy(mappings = type.mappings.map { it.validate(context = context) })

    override fun visit(type: FunctionType, context: TypeCheckingContext): Type =
        type.copy(
            argumentTypes = type.argumentTypes.map { it.validate(context = context) },
            returnType = type.returnType.validate(context = context)
        )

    override fun visit(type: UndecidedType, context: TypeCheckingContext): Type = type

}
