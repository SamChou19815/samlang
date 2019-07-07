package samlang.checker

import kotlinx.collections.immutable.*
import samlang.ast.checked.CheckedModule
import samlang.ast.checked.CheckedTypeExpr
import samlang.errors.*
import samlang.ast.common.Range

internal data class TypeCheckingContext(
    private val modules: ImmutableMap<String, ModuleType>,
    val currentModule: String,
    val localGenericTypes: ImmutableSet<String>,
    private val localValues: ImmutableMap<String, CheckedTypeExpr>
) {

    data class TypeInfo(val isPublic: Boolean, val typeParams: List<String>?, val type: CheckedTypeExpr.FunctionType)

    data class ModuleType(
        val typeDef: CheckedModule.CheckedTypeDef?,
        val functions: ImmutableMap<String, TypeInfo>,
        val methods: ImmutableMap<String, TypeInfo>
    )

    fun addNewModuleTypeDef(
        name: String,
        nameRange: Range,
        params: List<String>?,
        typeDefCreator: (TypeCheckingContext) -> CheckedModule.CheckedTypeDef
    ): Pair<CheckedModule.CheckedTypeDef, TypeCheckingContext> {
        if (modules.containsKey(key = name)) {
            throw CollisionError(collidedName = Range.WithName(range = nameRange, name = name))
        }
        val tempModuleType = ModuleType(
            typeDef = CheckedModule.CheckedTypeDef.ObjectType(
                typeParams = params,
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
        val newTypeDef = typeDefCreator(tempCxt)
        val newModuleType = ModuleType(
            typeDef = newTypeDef,
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
            throw CollisionError(collidedName = Range.WithName(range = nameRange, name = name))
        }
        val newModuleType = ModuleType(
            typeDef = null,
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

    fun getLocalValueType(name: String): CheckedTypeExpr? = localValues[name]

    fun getModuleFunctionType(
        module: String,
        member: String,
        manager: UndecidedTypeManager,
        errorRange: Range
    ): CheckedTypeExpr {
        val typeInfo = modules[module]?.functions?.get(member)?.takeIf { module == currentModule || it.isPublic }
            ?: throw UnresolvedNameError(unresolvedName = "$module::$member", range = errorRange)
        return if (typeInfo.typeParams == null) {
            typeInfo.type
        } else {
            val (t, _) = CheckedTypeDeparameterizer.convert(
                typeExpr = typeInfo.type, typeParams = typeInfo.typeParams, manager = manager
            )
            t
        }
    }

    fun getModuleMethodType(
        module: String,
        typeArgs: List<CheckedTypeExpr>?,
        methodName: String,
        manager: UndecidedTypeManager,
        errorRange: Range
    ): CheckedTypeExpr.FunctionType {
        val typeInfo = modules[module]?.methods?.get(methodName)?.takeIf { module == currentModule || it.isPublic }
            ?: throw UnresolvedNameError(unresolvedName = methodName, range = errorRange)
        val partiallyFixedType = if (typeInfo.typeParams == null) {
            typeInfo.type
        } else {
            val (t, _) = CheckedTypeDeparameterizer.convert(
                typeExpr = typeInfo.type, typeParams = typeInfo.typeParams, manager = manager
            )
            t
        }
        val typeParams = modules[module]!!.typeDef?.typeParams
        TypeParamSizeMismatchError.check(
            expectedSize = typeParams?.size ?: 0,
            actualSize = typeArgs?.size ?: 0,
            range = errorRange
        )
        val fullyFixedType = if (typeParams != null && typeArgs != null) {
            val typeFixingContext = typeParams.zip(typeArgs).toMap()
            ModuleTypeDefResolver.applyGenericTypeParams(type = partiallyFixedType, context = typeFixingContext)
        } else partiallyFixedType
        return fullyFixedType as CheckedTypeExpr.FunctionType
    }

    fun checkIfIdentifierTypeIsWellDefined(name: String, typeArgLength: Int, errorRange: Range) {
        val isGood = if (name in localGenericTypes) {
            typeArgLength == 0
        } else {
            val typeDef = modules[name]?.typeDef
                ?: throw NotWellDefinedIdentifierError(badIdentifier = name, range = errorRange)
            val typeParams = typeDef.typeParams
            if (typeParams == null) typeArgLength == 0 else typeParams.size == typeArgLength
        }
        if (!isGood) {
            throw NotWellDefinedIdentifierError(badIdentifier = name, range = errorRange)
        }
    }

    fun addLocalGenericTypes(genericTypes: Collection<String>): TypeCheckingContext =
        copy(localGenericTypes = localGenericTypes.plus(elements = genericTypes))

    fun getCurrentModuleTypeDef(): CheckedModule.CheckedTypeDef? = modules[currentModule]?.typeDef

    fun getCurrentModuleObjectTypeDef(errorRange: Range): CheckedModule.CheckedTypeDef.ObjectType =
        getCurrentModuleTypeDef() as? CheckedModule.CheckedTypeDef.ObjectType ?: throw UnsupportedModuleTypeDefError(
            expectedModuleTypeDef = UnsupportedModuleTypeDefError.ModuleTypeDef.OBJECT,
            range = errorRange
        )

    fun getCurrentModuleVariantTypeDef(errorRange: Range): CheckedModule.CheckedTypeDef.VariantType =
        getCurrentModuleTypeDef() as? CheckedModule.CheckedTypeDef.VariantType ?: throw UnsupportedModuleTypeDefError(
            expectedModuleTypeDef = UnsupportedModuleTypeDefError.ModuleTypeDef.VARIANT,
            range = errorRange
        )


    fun addThisType(): TypeCheckingContext {
        if (localValues.containsKey(key = "this")) {
            error(message = "Corrupted context!")
        }
        val typeParams = modules[currentModule]!!.typeDef!!.typeParams
        val type = CheckedTypeExpr.IdentifierType(
            identifier = currentModule,
            typeArgs = typeParams?.map { id -> CheckedTypeExpr.IdentifierType(identifier = id, typeArgs = null) }
        )
        return copy(
            localValues = localValues.plus(pair = "this" to type),
            localGenericTypes = typeParams?.let { localGenericTypes.plus(elements = it) } ?: localGenericTypes
        )
    }

    fun addLocalValueType(name: String, type: CheckedTypeExpr, errorRange: Range): TypeCheckingContext {
        if (localValues.containsKey(name)) {
            throw CollisionError(collidedName = Range.WithName(range = errorRange, name = name))
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
