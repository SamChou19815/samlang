package samlang.checker

import kotlinx.collections.immutable.ImmutableMap
import kotlinx.collections.immutable.ImmutableSet
import kotlinx.collections.immutable.immutableMapOf
import kotlinx.collections.immutable.immutableSetOf
import kotlinx.collections.immutable.plus
import samlang.ast.lang.ClassDefinition
import samlang.ast.common.Range
import samlang.ast.lang.Type
import samlang.errors.CollisionError
import samlang.errors.NotWellDefinedIdentifierError
import samlang.errors.TypeParamSizeMismatchError
import samlang.errors.UnresolvedNameError

data class TypeCheckingContext(
    val classes: ImmutableMap<String, ClassType>,
    val currentClass: String,
    val localGenericTypes: ImmutableSet<String>,
    private val localValues: ImmutableMap<String, Type>
) {

    data class TypeInfo(val isPublic: Boolean, val typeParams: List<String>?, val type: Type.FunctionType)

    data class ClassType(
        val typeDefinition: ClassDefinition.TypeDefinition,
        val functions: ImmutableMap<String, TypeInfo>,
        val methods: ImmutableMap<String, TypeInfo>
    )

    private fun addNewClassTypeDefinition(
        name: String,
        nameRange: Range,
        typeDefinition: ClassDefinition.TypeDefinition
    ): TypeCheckingContext {
        if (classes.containsKey(key = name)) {
            throw CollisionError(collidedName = name, range = nameRange)
        }
        val newModuleType = ClassType(
            typeDefinition = typeDefinition,
            functions = immutableMapOf(),
            methods = immutableMapOf()
        )
        return TypeCheckingContext(
            classes = classes.plus(pair = name to newModuleType),
            currentClass = name,
            localGenericTypes = typeDefinition.typeParameters
                ?.let { localGenericTypes.plus(elements = it) }
                ?: localGenericTypes,
            localValues = localValues
        )
    }

    /**
     * @return a new context with [classDefinition]'s type definition without [classDefinition]'s members.
     * It does not check validity of types of the given [classDefinition].
     */
    fun addClassTypeDefinition(classDefinition: ClassDefinition): TypeCheckingContext =
        addNewClassTypeDefinition(
            name = classDefinition.name,
            nameRange = classDefinition.nameRange,
            typeDefinition = classDefinition.typeDefinition
        )

    fun addMembersAndMethodsToCurrentClass(
        members: List<Triple<String, Boolean, TypeInfo>>
    ): TypeCheckingContext {
        val functions = arrayListOf<Pair<String, TypeInfo>>()
        val methods = arrayListOf<Pair<String, TypeInfo>>()
        for ((name, isMethod, typeInfo) in members) {
            if (isMethod) {
                methods.add(name to typeInfo)
            } else {
                functions.add(name to typeInfo)
            }
        }
        val newCurrentModule = classes[currentClass]!!.copy(
            functions = functions.fold(initial = immutableMapOf()) { m, pair -> m.plus(pair = pair) },
            methods = methods.fold(initial = immutableMapOf()) { m, pair -> m.plus(pair = pair) }
        )
        return copy(classes = classes.plus(pair = currentClass to newCurrentModule))
    }

    fun getLocalValueType(name: String): Type? = localValues[name]

    fun getClassFunctionType(
        module: String,
        member: String,
        errorRange: Range
    ): Type {
        val typeInfo = classes[module]?.functions?.get(member)?.takeIf { module == currentClass || it.isPublic }
            ?: throw UnresolvedNameError(unresolvedName = "$module::$member", range = errorRange)
        return if (typeInfo.typeParams == null) {
            typeInfo.type
        } else {
            val (typeWithParametersUndecided, _) = undecideTypeParameters(
                type = typeInfo.type, typeParameters = typeInfo.typeParams
            )
            typeWithParametersUndecided
        }
    }

    fun getClassMethodType(
        module: String,
        typeArgs: List<Type>?,
        methodName: String,
        errorRange: Range
    ): Type.FunctionType {
        val typeInfo = classes[module]?.methods?.get(methodName)?.takeIf { module == currentClass || it.isPublic }
            ?: throw UnresolvedNameError(unresolvedName = methodName, range = errorRange)
        val partiallyFixedType = if (typeInfo.typeParams == null) {
            typeInfo.type
        } else {
            val (typeWithParametersUndecided, _) = undecideTypeParameters(
                type = typeInfo.type, typeParameters = typeInfo.typeParams
            )
            typeWithParametersUndecided
        }
        val typeParameters = classes[module]!!.typeDefinition.typeParameters
        TypeParamSizeMismatchError.check(
            expectedSize = typeParameters?.size ?: 0,
            actualSize = typeArgs?.size ?: 0,
            range = errorRange
        )
        val fullyFixedType = if (typeParameters != null && typeArgs != null) {
            val typeFixingContext = typeParameters.zip(typeArgs).toMap()
            ClassTypeDefinitionResolver.applyGenericTypeParameters(
                type = partiallyFixedType,
                context = typeFixingContext
            )
        } else partiallyFixedType
        return fullyFixedType as Type.FunctionType
    }

    fun checkIfIdentifierTypeIsWellDefined(name: String, typeArgLength: Int, errorRange: Range) {
        val isGood = if (name in localGenericTypes) {
            typeArgLength == 0
        } else {
            val typeDef = classes[name]?.typeDefinition
                ?: throw NotWellDefinedIdentifierError(badIdentifier = name, range = errorRange)
            val typeParams = typeDef.typeParameters
            if (typeParams == null) typeArgLength == 0 else typeParams.size == typeArgLength
        }
        if (!isGood) {
            throw NotWellDefinedIdentifierError(badIdentifier = name, range = errorRange)
        }
    }

    fun addLocalGenericTypes(genericTypes: Collection<String>): TypeCheckingContext =
        copy(localGenericTypes = localGenericTypes.plus(elements = genericTypes))

    fun getCurrentModuleTypeDefinition(): ClassDefinition.TypeDefinition? = classes[currentClass]?.typeDefinition

    fun addThisType(): TypeCheckingContext {
        if (localValues.containsKey(key = "this")) {
            error(message = "Corrupted context!")
        }
        val typeParameters = classes[currentClass]!!.typeDefinition.typeParameters
        val type = Type.IdentifierType(
            identifier = currentClass,
            typeArguments = typeParameters?.map { parameter ->
                Type.IdentifierType(
                    identifier = parameter,
                    typeArguments = null
                )
            }
        )
        return copy(
            localValues = localValues.plus(pair = "this" to type),
            localGenericTypes = typeParameters?.let { localGenericTypes.plus(elements = it) } ?: localGenericTypes
        )
    }

    fun addLocalValueType(name: String, type: Type, errorRange: Range): TypeCheckingContext {
        if (localValues.containsKey(name)) {
            throw CollisionError(collidedName = name, range = errorRange)
        }
        return copy(localValues = localValues.plus(pair = name to type))
    }

    companion object {

        val EMPTY: TypeCheckingContext = TypeCheckingContext(
            classes = immutableMapOf(),
            currentClass = "",
            localGenericTypes = immutableSetOf(),
            localValues = immutableMapOf()
        )
    }
}
