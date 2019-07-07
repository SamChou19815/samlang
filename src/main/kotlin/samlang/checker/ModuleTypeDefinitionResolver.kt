package samlang.checker

import samlang.ast.Range
import samlang.ast.TypeExpression
import samlang.ast.TypeExpression.*
import samlang.ast.TypeExpressionVisitor
import samlang.errors.IllegalOtherClassMatch
import samlang.errors.TypeParamSizeMismatchError

internal object ModuleTypeDefinitionResolver {

    fun applyGenericTypeParams(type: TypeExpression, context: Map<String, TypeExpression>): TypeExpression =
        type.accept(visitor = Visitor, context = context)

    fun getTypeDef(
        identifierType: IdentifierType,
        ctx: TypeCheckingContext,
        errorRange: Range,
        isFromObject: Boolean
    ): Map<String, TypeExpression> {
        val (_, id, typeArguments) = identifierType
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
        TypeExpressionVisitor<Map<String, TypeExpression>, TypeExpression> {

        override fun visit(typeExpression: UnitType, context: Map<String, TypeExpression>): TypeExpression =
            typeExpression

        override fun visit(typeExpression: IntType, context: Map<String, TypeExpression>): TypeExpression =
            typeExpression

        override fun visit(typeExpression: StringType, context: Map<String, TypeExpression>): TypeExpression =
            typeExpression

        override fun visit(typeExpression: BoolType, context: Map<String, TypeExpression>): TypeExpression =
            typeExpression

        override fun visit(typeExpression: IdentifierType, context: Map<String, TypeExpression>): TypeExpression {
            if (typeExpression.typeArguments != null) {
                val newTypeArguments =
                    typeExpression.typeArguments.map { applyGenericTypeParams(type = it, context = context) }
                return typeExpression.copy(typeArguments = newTypeArguments)
            }
            val replacement = context[typeExpression.identifier]
            if (replacement != null) {
                return replacement
            }
            return typeExpression
        }

        override fun visit(typeExpression: TupleType, context: Map<String, TypeExpression>): TypeExpression =
            TupleType(
                range = typeExpression.range,
                mappings = typeExpression.mappings.map { applyGenericTypeParams(type = it, context = context) }
            )

        override fun visit(typeExpression: FunctionType, context: Map<String, TypeExpression>): TypeExpression =
            FunctionType(
                range = typeExpression.range,
                argumentTypes = typeExpression.argumentTypes.map {
                    applyGenericTypeParams(
                        type = it,
                        context = context
                    )
                },
                returnType = applyGenericTypeParams(type = typeExpression.returnType, context = context)
            )

        override fun visit(typeExpression: UndecidedType, context: Map<String, TypeExpression>): TypeExpression =
            typeExpression

    }
}
