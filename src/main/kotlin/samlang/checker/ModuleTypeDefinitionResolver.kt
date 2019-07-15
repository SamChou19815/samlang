package samlang.checker

import samlang.ast.Module.TypeDefinitionType
import samlang.ast.Range
import samlang.ast.Type
import samlang.ast.Type.FunctionType
import samlang.ast.Type.IdentifierType
import samlang.ast.Type.PrimitiveType
import samlang.ast.Type.TupleType
import samlang.ast.Type.UndecidedType
import samlang.ast.TypeVisitor
import samlang.errors.IllegalOtherClassMatch
import samlang.errors.TypeParamSizeMismatchError
import samlang.errors.UnsupportedModuleTypeDefinitionError

internal object ModuleTypeDefinitionResolver {

    fun applyGenericTypeParams(type: Type, context: Map<String, Type>): Type =
        type.accept(visitor = Visitor, context = context)

    fun getTypeDef(
        identifierType: IdentifierType,
        typeDefinitionType: TypeDefinitionType,
        context: TypeCheckingContext,
        errorRange: Range
    ): Map<String, Type> {
        val (id, typeArguments) = identifierType
        if (id != context.currentModule) {
            throw IllegalOtherClassMatch(range = errorRange)
        }
        val (_, _, typeParameters, varMap) = context.getCurrentModuleTypeDefinition()
            ?.takeIf { it.type == typeDefinitionType }
            ?: throw UnsupportedModuleTypeDefinitionError(typeDefinitionType = typeDefinitionType, range = errorRange)
        return if (typeArguments == null) {
            if (typeParameters != null) {
                error(
                    message =
                    """
                    BAD! typeArguments: null, typeParameters: $typeParameters, identifierType: $identifierType
                    """.trimIndent()
                )
            }
            varMap
        } else {
            if (typeParameters == null) {
                error(
                    message =
                    """
                    BAD! typeArguments: $typeArguments, typeParameters: null, identifierType: $identifierType"
                    """.trimIndent()
                )
            }
            TypeParamSizeMismatchError.check(
                expectedSize = typeParameters.size,
                actualSize = typeArguments.size,
                range = errorRange
            )
            varMap.mapValues { (_, v) ->
                applyGenericTypeParams(
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
            if (type.typeArguments != null) {
                val newTypeArguments =
                    type.typeArguments.map { applyGenericTypeParams(type = it, context = context) }
                return type.copy(typeArguments = newTypeArguments)
            }
            val replacement = context[type.identifier]
            if (replacement != null) {
                return replacement
            }
            return type
        }

        override fun visit(type: TupleType, context: Map<String, Type>): Type =
            TupleType(mappings = type.mappings.map { applyGenericTypeParams(type = it, context = context) })

        override fun visit(type: FunctionType, context: Map<String, Type>): Type =
            FunctionType(
                argumentTypes = type.argumentTypes.map { applyGenericTypeParams(type = it, context = context) },
                returnType = applyGenericTypeParams(type = type.returnType, context = context)
            )

        override fun visit(type: UndecidedType, context: Map<String, Type>): Type = type
    }
}
