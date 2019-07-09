package samlang.checker

import kotlinx.collections.immutable.*
import samlang.ast.Module
import samlang.ast.Range
import samlang.ast.Type
import samlang.errors.*

internal data class TypeCheckingContext(
    private val modules: ImmutableMap<String, ModuleType>,
    val currentModule: String,
    val localGenericTypes: ImmutableSet<String>,
    private val localValues: ImmutableMap<String, Type>
) {

    data class TypeInfo(val isPublic: Boolean, val typeParams: List<String>?, val type: Type.FunctionType)

    data class ModuleType(
        val typeDefinition: Module.TypeDefinition?,
        val functions: ImmutableMap<String, TypeInfo>,
        val methods: ImmutableMap<String, TypeInfo>
    )

    fun addNewModuleTypeDefinition(
        name: String,
        nameRange: Range,
        typeDefinitionRange: Range,
        params: List<String>?,
        typeDefinitionCreator: (TypeCheckingContext) -> Module.TypeDefinition
    ): Pair<Module.TypeDefinition, TypeCheckingContext> {
        if (modules.containsKey(key = name)) {
            throw CollisionError(collidedName = name, range = nameRange)
        }
        val tempModuleType = ModuleType(
            typeDefinition = Module.TypeDefinition.ObjectType(
                range = typeDefinitionRange,
                typeParameters = params,
                mappings = emptyMap()
            ),
            functions = immutableMapOf(),
            methods = immutableMapOf()
        )
        val tempCxt = TypeCheckingContext(
            modules = modules.plus(pair = name to tempModuleType),
            currentModule = name,
            localGenericTypes = params?.let { localGenericTypes.plus(elements = it) } ?: localGenericTypes,
            localValues = localValues
        )
        val newTypeDef = typeDefinitionCreator(tempCxt)
        val newModuleType = ModuleType(
            typeDefinition = newTypeDef,
            functions = immutableMapOf(),
            methods = immutableMapOf()
        )
        return newTypeDef to copy(
            modules = modules.plus(pair = name to newModuleType),
            currentModule = name
        )
    }

    fun addNewEmptyUtilModule(name: String, nameRange: Range): TypeCheckingContext {
        if (modules.containsKey(key = name)) {
            throw CollisionError(collidedName = name, range = nameRange)
        }
        val newModuleType = ModuleType(
            typeDefinition = null,
            functions = immutableMapOf(),
            methods = immutableMapOf()
        )
        return copy(
            modules = modules.plus(pair = name to newModuleType),
            currentModule = name
        )
    }

    fun addMembersAndMethodsToCurrentModule(
        members: List<Triple<String, Boolean, TypeInfo>>
    ): TypeCheckingContext {
        val functions = arrayListOf<Pair<String, TypeInfo>>()
        val methods = arrayListOf<Pair<String, TypeInfo>>()
        for ((n, isMethod, typeInfo) in members) {
            if (isMethod) {
                methods.add(n to typeInfo)
            } else {
                functions.add(n to typeInfo)
            }
        }
        val newCurrentModule = modules[currentModule]!!.copy(
            functions = functions.fold(initial = immutableMapOf()) { m, pair -> m.plus(pair = pair) },
            methods = methods.fold(initial = immutableMapOf()) { m, pair -> m.plus(pair = pair) }
        )
        return copy(modules = modules.plus(pair = currentModule to newCurrentModule))
    }

    fun getLocalValueType(name: String): Type? = localValues[name]

    fun getModuleFunctionType(
        module: String,
        member: String,
        errorRange: Range
    ): Type {
        val typeInfo = modules[module]?.functions?.get(member)?.takeIf { module == currentModule || it.isPublic }
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

    fun getModuleMethodType(
        module: String,
        typeArgs: List<Type>?,
        methodName: String,
        errorRange: Range
    ): Type.FunctionType {
        val typeInfo = modules[module]?.methods?.get(methodName)?.takeIf { module == currentModule || it.isPublic }
            ?: throw UnresolvedNameError(unresolvedName = methodName, range = errorRange)
        val partiallyFixedType = if (typeInfo.typeParams == null) {
            typeInfo.type
        } else {
            val (typeWithParametersUndecided, _) = undecideTypeParameters(
                type = typeInfo.type, typeParameters = typeInfo.typeParams
            )
            typeWithParametersUndecided
        }
        val typeParams = modules[module]!!.typeDefinition?.typeParameters
        TypeParamSizeMismatchError.check(
            expectedSize = typeParams?.size ?: 0,
            actualSize = typeArgs?.size ?: 0,
            range = errorRange
        )
        val fullyFixedType = if (typeParams != null && typeArgs != null) {
            val typeFixingContext = typeParams.zip(typeArgs).toMap()
            ModuleTypeDefinitionResolver.applyGenericTypeParams(type = partiallyFixedType, context = typeFixingContext)
        } else partiallyFixedType
        return fullyFixedType as Type.FunctionType
    }

    fun checkIfIdentifierTypeIsWellDefined(name: String, typeArgLength: Int, errorRange: Range) {
        val isGood = if (name in localGenericTypes) {
            typeArgLength == 0
        } else {
            val typeDef = modules[name]?.typeDefinition
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

    fun getCurrentModuleTypeDef(): Module.TypeDefinition? = modules[currentModule]?.typeDefinition

    fun getCurrentModuleObjectTypeDef(errorRange: Range): Module.TypeDefinition.ObjectType =
        getCurrentModuleTypeDef() as? Module.TypeDefinition.ObjectType ?: throw UnsupportedModuleTypeDefError(
            expectedModuleTypeDef = UnsupportedModuleTypeDefError.ModuleTypeDef.OBJECT,
            range = errorRange
        )

    fun getCurrentModuleVariantTypeDef(errorRange: Range): Module.TypeDefinition.VariantType =
        getCurrentModuleTypeDef() as? Module.TypeDefinition.VariantType ?: throw UnsupportedModuleTypeDefError(
            expectedModuleTypeDef = UnsupportedModuleTypeDefError.ModuleTypeDef.VARIANT,
            range = errorRange
        )

    fun addThisType(): TypeCheckingContext {
        if (localValues.containsKey(key = "this")) {
            error(message = "Corrupted context!")
        }
        val typeParameters = modules[currentModule]!!.typeDefinition!!.typeParameters
        val type = Type.IdentifierType(
            identifier = currentModule,
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
            modules = immutableMapOf(),
            currentModule = "",
            localGenericTypes = immutableSetOf(),
            localValues = immutableMapOf()
        )

    }

}
