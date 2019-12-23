package samlang.checker

import kotlinx.collections.immutable.PersistentMap
import kotlinx.collections.immutable.PersistentSet
import kotlinx.collections.immutable.persistentMapOf
import kotlinx.collections.immutable.persistentSetOf
import samlang.ast.common.Range
import samlang.ast.common.Type
import samlang.ast.common.TypeDefinition
import samlang.checker.GlobalTypingContext.ClassType
import samlang.errors.CompileTimeError
import samlang.errors.TypeParamSizeMismatchError
import samlang.errors.UnresolvedNameError
import samlang.util.Either

data class TypeCheckingContext(
    val classes: PersistentMap<String, ClassType>,
    val currentClass: String,
    val localGenericTypes: PersistentSet<String>,
    private val localValues: PersistentMap<String, Type>
) {
    fun getLocalValueType(name: String): Type? = localValues[name]

    fun getClassFunctionType(module: String, member: String): Pair<Type, List<Type>>? {
        val typeInfo = classes[module]?.functions?.get(member)?.takeIf { module == currentClass || it.isPublic }
            ?: return null
        return if (typeInfo.typeParams == null) {
            typeInfo.type to emptyList()
        } else {
            val (typeWithParametersUndecided, typeParameters) = undecideTypeParameters(
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
            val (typeWithParametersUndecided, _) = undecideTypeParameters(
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

    fun identifierTypeIsWellDefined(name: String, typeArgumentLength: Int): Boolean {
        return if (name in localGenericTypes) {
            typeArgumentLength == 0
        } else {
            val typeDef = classes[name]?.typeDefinition ?: return false
            val typeParams = typeDef.typeParameters
            typeParams.size == typeArgumentLength
        }
    }

    fun addLocalGenericTypes(genericTypes: Collection<String>): TypeCheckingContext =
        copy(localGenericTypes = localGenericTypes.addAll(elements = genericTypes))

    fun getCurrentModuleTypeDefinition(): TypeDefinition? = classes[currentClass]?.typeDefinition

    fun addThisType(): TypeCheckingContext {
        if (localValues.containsKey(key = "this")) {
            error(message = "Corrupted context!")
        }
        val typeParameters = classes[currentClass]!!.typeDefinition.typeParameters
        val type = Type.IdentifierType(
            identifier = currentClass,
            typeArguments = typeParameters.map { Type.id(identifier = it) }
        )
        return copy(
            localValues = localValues.put(key = "this", value = type),
            localGenericTypes = localGenericTypes.addAll(elements = typeParameters)
        )
    }

    fun addLocalValueType(name: String, type: Type, onCollision: () -> Unit): TypeCheckingContext {
        if (localValues.containsKey(name)) {
            onCollision()
            return this
        }
        return copy(localValues = localValues.put(key = name, value = type))
    }

    companion object {

        val EMPTY: TypeCheckingContext = TypeCheckingContext(
            classes = persistentMapOf(),
            currentClass = "",
            localGenericTypes = persistentSetOf(),
            localValues = persistentMapOf()
        )
    }
}
