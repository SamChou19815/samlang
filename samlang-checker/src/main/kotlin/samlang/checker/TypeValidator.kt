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

internal fun Type.validate(context: TypeCheckingContext, errorCollector: ErrorCollector, errorRange: Range): Type? =
    accept(visitor = TypeValidator(errorCollector = errorCollector, errorRange = errorRange), context = context)

/**
 * A validator for type to check whether every identifier type is well defined.
 */
private class TypeValidator(private val errorCollector: ErrorCollector, private val errorRange: Range) :
    TypeVisitor<TypeCheckingContext, Type?> {

    override fun visit(type: PrimitiveType, context: TypeCheckingContext): Type = type

    override fun visit(type: IdentifierType, context: TypeCheckingContext): Type? {
        val (name, typeArguments) = type
        if (!context.identifierTypeIsWellDefined(name = name, typeArgumentLength = typeArguments.size)) {
            errorCollector.add(NotWellDefinedIdentifierError(badIdentifier = name, range = errorRange))
            return null
        }
        return validate(list = typeArguments, context = context)?.let { type.copy(typeArguments = it) }
    }

    override fun visit(type: TupleType, context: TypeCheckingContext): Type? =
        validate(list = type.mappings, context = context)?.let { type.copy(mappings = it) }

    override fun visit(type: FunctionType, context: TypeCheckingContext): Type? {
        val validatedArgumentTypes = validate(list = type.argumentTypes, context = context) ?: return null
        val validatedReturnType = type.returnType.accept(visitor = this, context = context) ?: return null
        return type.copy(argumentTypes = validatedArgumentTypes, returnType = validatedReturnType)
    }

    override fun visit(type: UndecidedType, context: TypeCheckingContext): Type = type

    private fun validate(list: List<Type>, context: TypeCheckingContext): List<Type>? {
        val collector = arrayListOf<Type>()
        for (type in list) {
            val validated = type.accept(visitor = this, context = context) ?: return null
            collector.add(element = validated)
        }
        return collector
    }
}
