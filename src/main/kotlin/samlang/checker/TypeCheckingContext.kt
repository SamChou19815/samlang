package samlang.checker

import kotlinx.collections.immutable.*
import samlang.ast.checked.CheckedModule
import samlang.ast.checked.CheckedTypeExpr
import samlang.errors.*
import samlang.parser.Position

internal data class TypeCheckingContext(
    private val modules: ImmutableMap<String, ModuleType>,
    val currentModule: String,
    private val localGenericTypes: ImmutableSet<String>,
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
        namePosition: Position,
        params: List<String>?,
        typeDefCreator: (TypeCheckingContext) -> CheckedModule.CheckedTypeDef
    ): Pair<CheckedModule.CheckedTypeDef, TypeCheckingContext> {
        if (modules.containsKey(key = name)) {
            throw CollisionError(collidedName = Position.WithName(position = namePosition, name = name))
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

    fun addNewEmptyUtilModule(name: String, namePosition: Position): TypeCheckingContext {
        if (modules.containsKey(key = name)) {
            throw CollisionError(collidedName = Position.WithName(position = namePosition, name = name))
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
        errorPosition: Position
    ): CheckedTypeExpr {
        val typeInfo = modules[module]?.functions?.get(member)?.takeIf { module == currentModule || it.isPublic }
            ?: throw UnresolvedNameError(unresolvedName = "$module::$member", position = errorPosition)
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
        errorPosition: Position
    ): CheckedTypeExpr.FunctionType {
        val typeInfo = modules[module]?.methods?.get(methodName)?.takeIf { module == currentModule || it.isPublic }
            ?: throw UnresolvedNameError(unresolvedName = methodName, position = errorPosition)
        val partiallyFixedType = if (typeInfo.typeParams == null) {
            typeInfo.type
        } else {
            val (t, _) = CheckedTypeDeparameterizer.convert(
                typeExpr = typeInfo.type, typeParams = typeInfo.typeParams, manager = manager
            )
            t
        }
        val typeParams = getCurrentModuleTypeDef()?.typeParams
        TypeParamSizeMismatchError.check(
            expectedSize = typeParams?.size ?: 0,
            actualSize = typeArgs?.size ?: 0,
            position = errorPosition
        )
        val fullyFixedType = if (typeParams != null && typeArgs != null) {
            ModuleTypeDefResolver.applyGenericTypeParams(
                type = partiallyFixedType,
                context = typeParams.zip(typeArgs).toMap()
            )
        } else partiallyFixedType
        return fullyFixedType as CheckedTypeExpr.FunctionType
    }

    fun checkIfIdentifierTypeIsWellDefined(name: String, typeArgLength: Int, errorPosition: Position) {
        val isGood = if (name in localGenericTypes) {
            typeArgLength == 0
        } else {
            val typeDef = modules[name]?.typeDef
                ?: throw NotWellDefinedIdentifierError(badIdentifier = name, position = errorPosition)
            val typeParams = typeDef.typeParams
            if (typeParams == null) typeArgLength == 0 else typeParams.size == typeArgLength
        }
        if (!isGood) {
            throw NotWellDefinedIdentifierError(badIdentifier = name, position = errorPosition)
        }
    }

    fun addLocalGenericType(genericType: String): TypeCheckingContext =
        copy(localGenericTypes = localGenericTypes.plus(element = genericType))

    fun addLocalGenericTypes(genericTypes: Collection<String>): TypeCheckingContext =
        copy(localGenericTypes = localGenericTypes.plus(elements = genericTypes))

    fun getCurrentModuleTypeDef(): CheckedModule.CheckedTypeDef? = modules[currentModule]?.typeDef

    fun getCurrentModuleObjectTypeDef(errorPosition: Position): CheckedModule.CheckedTypeDef.ObjectType =
        getCurrentModuleTypeDef() as? CheckedModule.CheckedTypeDef.ObjectType ?: throw UnsupportedModuleTypeDefError(
            expectedModuleTypeDef = UnsupportedModuleTypeDefError.ModuleTypeDef.OBJECT,
            position = errorPosition
        )

    fun getCurrentModuleVariantTypeDef(errorPosition: Position): CheckedModule.CheckedTypeDef.VariantType =
        getCurrentModuleTypeDef() as? CheckedModule.CheckedTypeDef.VariantType ?: throw UnsupportedModuleTypeDefError(
            expectedModuleTypeDef = UnsupportedModuleTypeDefError.ModuleTypeDef.VARIANT,
            position = errorPosition
        )

    fun addThisType(genericTypes: Collection<String>?): TypeCheckingContext {
        if (localValues.containsKey(key = "this")) {
            error(message = "Corrupted context!")
        }
        val type = CheckedTypeExpr.IdentifierType(
            identifier = currentModule,
            typeArgs = genericTypes?.map { id -> CheckedTypeExpr.IdentifierType(identifier = id, typeArgs = null) }
        )
        return copy(localValues = localValues.plus(pair = "this" to type))
    }

    fun addLocalValueType(name: String, type: CheckedTypeExpr, errorPosition: Position): TypeCheckingContext {
        if (localValues.containsKey(name)) {
            throw CollisionError(collidedName = Position.WithName(position = errorPosition, name = name))
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
