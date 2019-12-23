package samlang.checker

import samlang.ast.common.Range
import samlang.ast.common.Type
import samlang.ast.common.Type.FunctionType
import samlang.ast.common.Type.IdentifierType
import samlang.ast.common.Type.PrimitiveType
import samlang.ast.common.Type.TupleType
import samlang.ast.common.Type.UndecidedType
import samlang.ast.common.TypeVisitor
import samlang.errors.NotWellDefinedIdentifierError

internal fun Type.validate(context: TypeCheckingContext, errorRange: Range): Type =
    accept(visitor = TypeValidator(errorRange = errorRange), context = context)

/**
 * A validator for type to check whether every identifier type is well defined.
 */
private class TypeValidator(private val errorRange: Range) :
    TypeVisitor<TypeCheckingContext, Type> {

    override fun visit(type: PrimitiveType, context: TypeCheckingContext): Type = type

    override fun visit(type: IdentifierType, context: TypeCheckingContext): Type {
        val (name, typeArguments) = type
        if (!context.identifierTypeIsWellDefined(name = name, typeArgumentLength = typeArguments.size)) {
            throw NotWellDefinedIdentifierError(badIdentifier = name, range = errorRange)
        }
        return type.copy(typeArguments = typeArguments.map { it.accept(visitor = this, context = context) })
    }

    override fun visit(type: TupleType, context: TypeCheckingContext): Type =
        type.copy(mappings = type.mappings.map { it.accept(visitor = this, context = context) })

    override fun visit(type: FunctionType, context: TypeCheckingContext): Type =
        type.copy(
            argumentTypes = type.argumentTypes.map { it.accept(visitor = this, context = context) },
            returnType = type.returnType.accept(visitor = this, context = context)
        )

    override fun visit(type: UndecidedType, context: TypeCheckingContext): Type = type
}
