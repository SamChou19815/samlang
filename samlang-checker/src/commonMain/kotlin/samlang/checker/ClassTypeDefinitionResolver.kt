package samlang.checker

import samlang.ast.common.Range
import samlang.ast.common.Type
import samlang.ast.common.Type.FunctionType
import samlang.ast.common.Type.IdentifierType
import samlang.ast.common.Type.PrimitiveType
import samlang.ast.common.Type.TupleType
import samlang.ast.common.Type.UndecidedType
import samlang.ast.common.TypeDefinition
import samlang.ast.common.TypeDefinitionType
import samlang.ast.common.TypeVisitor
import samlang.errors.CompileTimeError
import samlang.errors.IllegalOtherClassMatch
import samlang.errors.TypeParamSizeMismatchError
import samlang.errors.UnsupportedClassTypeDefinitionError
import samlang.util.Either

internal object ClassTypeDefinitionResolver {
    fun applyGenericTypeParameters(type: Type, context: Map<String, Type>): Type =
        type.accept(visitor = Visitor, context = context)

    fun getTypeDefinition(
        identifierType: IdentifierType,
        typeDefinitionType: TypeDefinitionType,
        context: AccessibleGlobalTypingContext,
        errorRange: Range
    ): Either<Pair<List<String>, Map<String, TypeDefinition.FieldType>>, CompileTimeError> {
        val (id, typeArguments) = identifierType
        if (id != context.currentClass && typeDefinitionType == TypeDefinitionType.VARIANT) {
            return Either.Right(v = IllegalOtherClassMatch(range = errorRange))
        }
        val (_, _, typeParameters, names, varMap) = context.getClassTypeDefinition(className = id)
            ?.takeIf { it.type == typeDefinitionType }
            ?: return Either.Right(
                v = UnsupportedClassTypeDefinitionError(typeDefinitionType = typeDefinitionType, range = errorRange)
            )
        if (typeParameters.size != typeArguments.size) {
            return Either.Right(
                v = TypeParamSizeMismatchError(
                    expectedSize = typeParameters.size,
                    actualSize = typeArguments.size,
                    range = errorRange
                )
            )
        }
        return varMap.mapValues { (_, v) ->
            val (declaredType, isPublic) = v
            val genericTypeParameterAppliedType = applyGenericTypeParameters(
                type = declaredType,
                context = typeParameters.zip(typeArguments).toMap()
            )
            TypeDefinition.FieldType(type = genericTypeParameterAppliedType, isPublic = isPublic)
        }.let { Either.Left(v = names to it) }
    }

    private object Visitor : TypeVisitor<Map<String, Type>, Type> {
        override fun visit(type: PrimitiveType, context: Map<String, Type>): Type = type

        override fun visit(type: IdentifierType, context: Map<String, Type>): Type {
            val typeArguments = type.typeArguments
            if (typeArguments.isNotEmpty()) {
                val newTypeArguments = typeArguments.map { it.accept(visitor = this, context = context) }
                return type.copy(typeArguments = newTypeArguments)
            }
            val replacement = context[type.identifier]
            if (replacement != null) {
                return replacement
            }
            return type
        }

        override fun visit(type: TupleType, context: Map<String, Type>): Type =
            TupleType(mappings = type.mappings.map { it.accept(visitor = this, context = context) })

        override fun visit(type: FunctionType, context: Map<String, Type>): Type =
            FunctionType(
                argumentTypes = type.argumentTypes.map { it.accept(visitor = this, context = context) },
                returnType = type.returnType.accept(visitor = this, context = context)
            )

        override fun visit(type: UndecidedType, context: Map<String, Type>): Type = type
    }
}
