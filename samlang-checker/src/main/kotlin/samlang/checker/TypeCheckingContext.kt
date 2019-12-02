package samlang.checker

import kotlinx.collections.immutable.PersistentMap
import kotlinx.collections.immutable.PersistentSet
import kotlinx.collections.immutable.persistentMapOf
import kotlinx.collections.immutable.persistentSetOf
import samlang.ast.common.Range
import samlang.ast.common.Type
import samlang.ast.common.TypeDefinition
import samlang.ast.lang.ClassDefinition
import samlang.errors.CollisionError
import samlang.errors.NotWellDefinedIdentifierError
import samlang.errors.TypeParamSizeMismatchError
import samlang.errors.UnresolvedNameError

data class TypeCheckingContext(
    val classes: PersistentMap<String, ClassType>,
    val currentClass: String,
    val localGenericTypes: PersistentSet<String>,
    private val localValues: PersistentMap<String, Type>
) {

    data class TypeInfo(val isPublic: Boolean, val typeParams: List<String>?, val type: Type.FunctionType)

    data class ClassType(
        val typeDefinition: TypeDefinition,
        val functions: PersistentMap<String, TypeInfo>,
        val methods: PersistentMap<String, TypeInfo>
    )

    private fun addNewClassTypeDefinition(
        name: String,
        nameRange: Range,
        typeDefinition: TypeDefinition
    ): TypeCheckingContext {
        if (classes.containsKey(key = name)) {
            throw CollisionError(collidedName = name, range = nameRange)
        }
        val newModuleType = ClassType(
            typeDefinition = typeDefinition,
            functions = persistentMapOf(),
            methods = persistentMapOf()
        )
        return TypeCheckingContext(
            classes = classes.put(key = name, value = newModuleType),
            currentClass = name,
            localGenericTypes = localGenericTypes.addAll(elements = typeDefinition.typeParameters),
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
            functions = functions.fold(initial = persistentMapOf()) { member, (key, value) ->
                member.put(key = key, value = value)
            },
            methods = methods.fold(initial = persistentMapOf()) { member, (key, value) ->
                member.put(key = key, value = value)
            }
        )
        return copy(classes = classes.put(key = currentClass, value = newCurrentModule))
    }

    fun getLocalValueType(name: String): Type? = localValues[name]

    fun getClassFunctionType(
        module: String,
        member: String,
        errorRange: Range
    ): Pair<Type, List<Type>> {
        val typeInfo = classes[module]?.functions?.get(member)?.takeIf { module == currentClass || it.isPublic }
            ?: throw UnresolvedNameError(unresolvedName = "$module::$member", range = errorRange)
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
            expectedSize = typeParameters.size,
            actualSize = typeArguments.size,
            range = errorRange
        )
        val fullyFixedType = ClassTypeDefinitionResolver.applyGenericTypeParameters(
            type = partiallyFixedType,
            context = typeParameters.zip(typeArguments).toMap()
        )
        return fullyFixedType as Type.FunctionType
    }

    fun checkIfIdentifierTypeIsWellDefined(name: String, typeArgumentLength: Int, errorRange: Range) {
        val isGood = if (name in localGenericTypes) {
            typeArgumentLength == 0
        } else {
            val typeDef = classes[name]?.typeDefinition
                ?: throw NotWellDefinedIdentifierError(badIdentifier = name, range = errorRange)
            val typeParams = typeDef.typeParameters
            typeParams.size == typeArgumentLength
        }
        if (!isGood) {
            throw NotWellDefinedIdentifierError(badIdentifier = name, range = errorRange)
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

    fun addLocalValueType(name: String, type: Type, errorRange: Range): TypeCheckingContext {
        if (localValues.containsKey(name)) {
            throw CollisionError(collidedName = name, range = errorRange)
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
