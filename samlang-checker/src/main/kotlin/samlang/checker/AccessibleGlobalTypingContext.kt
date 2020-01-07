package samlang.checker

import kotlinx.collections.immutable.PersistentMap
import kotlinx.collections.immutable.PersistentSet
import samlang.ast.common.Range
import samlang.ast.common.Type
import samlang.ast.common.TypeDefinition
import samlang.checker.GlobalTypingContext.ClassType
import samlang.errors.CompileTimeError
import samlang.errors.TypeParamSizeMismatchError
import samlang.errors.UnresolvedNameError
import samlang.util.Either

/** Keep track of a set of global symbols that are accessible to a local context. */
internal data class AccessibleGlobalTypingContext(
    private val classes: PersistentMap<String, ClassType>,
    val typeParameters: PersistentSet<String>,
    val currentClass: String
) : IdentifierTypeValidator {
    fun getClassFunctionType(module: String, member: String): Pair<Type, List<Type>>? {
        val typeInfo = classes[module]?.functions?.get(member)?.takeIf { module == currentClass || it.isPublic }
            ?: return null
        return if (typeInfo.typeParams == null) {
            typeInfo.type to emptyList()
        } else {
            val (typeWithParametersUndecided, typeParameters) = TypeUndecider.undecideTypeParameters(
                type = typeInfo.type, typeParameters = typeInfo.typeParams
            )
            typeWithParametersUndecided to typeParameters
        }
    }

    fun getClassMethodType(
        module: String,
        typeArguments: List<Type>,
        methodName: String,
        errorRange: Range
    ): Either<Type.FunctionType, CompileTimeError> {
        val typeInfo = classes[module]?.methods?.get(methodName)?.takeIf { module == currentClass || it.isPublic }
            ?: return Either.Right(v = UnresolvedNameError(unresolvedName = methodName, range = errorRange))
        val partiallyFixedType = if (typeInfo.typeParams == null) {
            typeInfo.type
        } else {
            val (typeWithParametersUndecided, _) = TypeUndecider.undecideTypeParameters(
                type = typeInfo.type, typeParameters = typeInfo.typeParams
            )
            typeWithParametersUndecided
        }
        val typeParameters = classes[module]!!.typeDefinition.typeParameters
        if (typeParameters.size != typeArguments.size) {
            return Either.Right(
                v = TypeParamSizeMismatchError(
                    expectedSize = typeParameters.size,
                    actualSize = typeArguments.size,
                    range = errorRange
                )
            )
        }
        val fullyFixedType = ClassTypeDefinitionResolver.applyGenericTypeParameters(
            type = partiallyFixedType,
            context = typeParameters.zip(typeArguments).toMap()
        )
        return Either.Left(v = fullyFixedType as Type.FunctionType)
    }

    fun getCurrentModuleTypeDefinition(): TypeDefinition? = classes[currentClass]?.typeDefinition

    val thisType: Type
        get() =
            Type.IdentifierType(
                identifier = currentClass,
                typeArguments = classes[currentClass]!!.typeDefinition.typeParameters.map { Type.id(identifier = it) }
            )

    override fun identifierTypeIsWellDefined(name: String, typeArgumentLength: Int): Boolean {
        return if (name in typeParameters) {
            typeArgumentLength == 0
        } else {
            val typeDef = classes[name]?.typeDefinition ?: return false
            val typeParams = typeDef.typeParameters
            typeParams.size == typeArgumentLength
        }
    }

    fun withAdditionalTypeParameters(typeParameters: Collection<String>): AccessibleGlobalTypingContext =
        copy(typeParameters = this.typeParameters.addAll(elements = typeParameters))
}
