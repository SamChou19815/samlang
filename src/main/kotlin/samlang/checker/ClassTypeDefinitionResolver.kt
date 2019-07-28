package samlang.checker

import samlang.ast.common.Range
import samlang.ast.common.Type
import samlang.ast.common.Type.FunctionType
import samlang.ast.common.Type.IdentifierType
import samlang.ast.common.Type.PrimitiveType
import samlang.ast.common.Type.TupleType
import samlang.ast.common.Type.UndecidedType
import samlang.ast.common.TypeDefinitionType
import samlang.ast.common.TypeVisitor
import samlang.errors.IllegalOtherClassMatch
import samlang.errors.TypeParamSizeMismatchError
import samlang.errors.UnsupportedClassTypeDefinitionError

internal object ClassTypeDefinitionResolver {

    fun applyGenericTypeParameters(type: Type, context: Map<String, Type>): Type =
        type.accept(visitor = Visitor, context = context)

    fun getTypeDefinition(
        identifierType: IdentifierType,
        typeDefinitionType: TypeDefinitionType,
        context: TypeCheckingContext,
        errorRange: Range
    ): Map<String, Type> {
        val (id, typeArguments) = identifierType
        if (id != context.currentClass) {
            throw IllegalOtherClassMatch(range = errorRange)
        }
        val (_, _, typeParameters, varMap) = context.getCurrentModuleTypeDefinition()
            ?.takeIf { it.type == typeDefinitionType }
            ?: throw UnsupportedClassTypeDefinitionError(typeDefinitionType = typeDefinitionType, range = errorRange)
        return run {
            TypeParamSizeMismatchError.check(
                expectedSize = typeParameters.size,
                actualSize = typeArguments.size,
                range = errorRange
            )
            varMap.mapValues { (_, v) ->
                applyGenericTypeParameters(
                    type = v,
                    context = typeParameters.zip(typeArguments).toMap()
                )
            }
        }
    }

    private object Visitor :
        TypeVisitor<Map<String, Type>, Type> {

        override fun visit(type: PrimitiveType, context: Map<String, Type>): Type = type

        override fun visit(type: IdentifierType, context: Map<String, Type>): Type {
            val typeArguments = type.typeArguments
            if (typeArguments.isNotEmpty()) {
                val newTypeArguments = typeArguments.map { applyGenericTypeParameters(type = it, context = context) }
                return type.copy(typeArguments = newTypeArguments)
            }
            val replacement = context[type.identifier]
            if (replacement != null) {
                return replacement
            }
            return type
        }

        override fun visit(type: TupleType, context: Map<String, Type>): Type =
            TupleType(mappings = type.mappings.map { applyGenericTypeParameters(type = it, context = context) })

        override fun visit(type: FunctionType, context: Map<String, Type>): Type =
            FunctionType(
                argumentTypes = type.argumentTypes.map { applyGenericTypeParameters(type = it, context = context) },
                returnType = applyGenericTypeParameters(type = type.returnType, context = context)
            )

        override fun visit(type: UndecidedType, context: Map<String, Type>): Type = type
    }
}
