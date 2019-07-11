package samlang.checker

import samlang.ast.Range
import samlang.ast.Type
import samlang.ast.Type.*
import samlang.ast.TypeVisitor
import samlang.errors.IllegalOtherClassMatch
import samlang.errors.TypeParamSizeMismatchError

internal object ModuleTypeDefinitionResolver {

    fun applyGenericTypeParams(type: Type, context: Map<String, Type>): Type =
        type.accept(visitor = Visitor, context = context)

    fun getTypeDef(
        identifierType: IdentifierType,
        ctx: TypeCheckingContext,
        errorRange: Range,
        isFromObject: Boolean
    ): Map<String, Type> {
        val (id, typeArguments) = identifierType
        if (id != ctx.currentModule) {
            throw IllegalOtherClassMatch(range = errorRange)
        }
        val (typeParameters, varMap) = if (isFromObject) {
            val (_, p, m) = ctx.getCurrentModuleObjectTypeDef(errorRange = errorRange)
            p to m
        } else {
            val (_, p, m) = ctx.getCurrentModuleVariantTypeDef(errorRange = errorRange)
            p to m
        }
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
                error(message = "BAD! typeArguments: $typeArguments, typeParameters: null, identifierType: $identifierType")
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
