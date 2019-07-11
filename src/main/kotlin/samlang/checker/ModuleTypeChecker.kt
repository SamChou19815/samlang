package samlang.checker

import samlang.ast.Expression
import samlang.ast.Module
import samlang.ast.Range
import samlang.ast.Type
import samlang.errors.CollisionError
import samlang.errors.IllegalMethodDefinitionError

internal fun Module.typeCheck(
    errorCollector: ErrorCollector,
    typeCheckingContext: TypeCheckingContext
): Pair<Module?, TypeCheckingContext> {
    val (_, moduleNameRange, moduleName, moduleTypeDefinition, moduleMembers) = this
    val (checkedTypeDef, partialContext) = errorCollector.returnNullOnCollectedError {
        createContextWithCurrentModuleDefOnly(
            moduleNameRange = moduleNameRange,
            moduleName = moduleName,
            moduleTypeDefinition = moduleTypeDefinition,
            errorCollector = errorCollector,
            typeCheckingContext = typeCheckingContext
        )
    } ?: return null to typeCheckingContext
    val (fullContext, partiallyCheckedMembers) = errorCollector.returnNullOnCollectedError {
        processCurrentContextWithMembersAndMethods(
            moduleRange = moduleNameRange,
            moduleName = moduleName,
            moduleMembers = moduleMembers,
            isUtilModule = moduleTypeDefinition == null,
            typeCheckingContext = partialContext
        )
    } ?: return null to typeCheckingContext
    val checkedModule = this.copy(
        typeDefinition = checkedTypeDef,
        members = partiallyCheckedMembers.map { memberDefinition ->
            typeCheckMember(
                member = memberDefinition,
                errorCollector = errorCollector,
                typeCheckingContext = fullContext
            )
        }
    )
    return checkedModule to fullContext
}

private fun Collection<String>.checkNameCollision(range: Range) {
    val nameSet = hashSetOf<String>()
    forEach { name ->
        if (!nameSet.add(element = name)) {
            throw CollisionError(collidedName = name, range = range)
        }
    }
}

private fun createContextWithCurrentModuleDefOnly(
    moduleNameRange: Range,
    moduleName: String,
    moduleTypeDefinition: Module.TypeDefinition?,
    errorCollector: ErrorCollector,
    typeCheckingContext: TypeCheckingContext
): Pair<Module.TypeDefinition?, TypeCheckingContext> {
    // new context with type def but empty members and extensions
    return if (moduleTypeDefinition == null) {
        null to typeCheckingContext.addNewEmptyUtilModule(name = moduleName, nameRange = moduleNameRange)
    } else {
        val range = moduleTypeDefinition.range
        val typeParameters = moduleTypeDefinition.typeParameters
        val (isObject, mappings) = when (moduleTypeDefinition) {
            is Module.TypeDefinition.ObjectType -> {
                true to moduleTypeDefinition.mappings
            }
            is Module.TypeDefinition.VariantType -> {
                false to moduleTypeDefinition.mappings
            }
        }
        // check name collisions
        errorCollector.returnNullOnCollectedError {
            typeParameters?.checkNameCollision(range = range)
            mappings.keys.checkNameCollision(range = range)
            Unit
        } ?: return null to typeCheckingContext
        // create checked type def based on a temp
        typeCheckingContext.addNewModuleTypeDefinition(
            name = moduleName,
            nameRange = moduleNameRange,
            typeDefinitionRange = range,
            params = typeParameters
        ) { tempContext ->
            val checkedMappings = mappings.mapValues { (_, type) ->
                type.collectPotentialError(errorCollector = errorCollector) {
                    this.validate(context = tempContext, errorRange = range)
                }
            }
            if (isObject) {
                Module.TypeDefinition.ObjectType(
                    range = range,
                    typeParameters = typeParameters,
                    mappings = checkedMappings
                )
            } else {
                Module.TypeDefinition.VariantType(
                    range = range,
                    typeParameters = typeParameters,
                    mappings = checkedMappings
                )
            }
        }
    }
}

private fun processCurrentContextWithMembersAndMethods(
    moduleRange: Range,
    moduleName: String,
    moduleMembers: List<Module.MemberDefinition>,
    isUtilModule: Boolean,
    typeCheckingContext: TypeCheckingContext
): Pair<TypeCheckingContext, List<Module.MemberDefinition>> {
    moduleMembers.map { it.name }.checkNameCollision(range = moduleRange)
    val partiallyCheckedMembers = moduleMembers.map { member ->
        val typeParameters = member.typeParameters
        typeParameters?.checkNameCollision(range = member.range)
        var newContext = typeParameters
            ?.let { typeCheckingContext.addLocalGenericTypes(genericTypes = it) }
            ?: typeCheckingContext
        if (member.isMethod) {
            if (isUtilModule) {
                throw IllegalMethodDefinitionError(
                    name = moduleName,
                    range = moduleRange
                )
            }
            val updatedNewCtx = newContext.getCurrentModuleTypeDef()
                ?.typeParameters
                ?.let { newContext.addLocalGenericTypes(genericTypes = it) }
            if (updatedNewCtx != null) {
                newContext = updatedNewCtx
            }
        }
        val type = member.type.validate(context = newContext, errorRange = member.range) as Type.FunctionType
        member.copy(typeParameters = typeParameters, type = type)
    }
    val memberTypeInfo = partiallyCheckedMembers.map { member ->
        Triple(
            first = member.name,
            second = member.isMethod,
            third = TypeCheckingContext.TypeInfo(
                isPublic = member.isPublic,
                typeParams = member.typeParameters,
                type = member.type
            )
        )
    }
    val newCtx = typeCheckingContext.addMembersAndMethodsToCurrentModule(members = memberTypeInfo)
    return newCtx to partiallyCheckedMembers
}

private fun typeCheckMember(
    member: Module.MemberDefinition,
    errorCollector: ErrorCollector,
    typeCheckingContext: TypeCheckingContext
): Module.MemberDefinition {
    val (_, _, _, _, typeParameters, type, value) = member
    var contextForTypeCheckingValue =
        if (member.isMethod) typeCheckingContext.addThisType() else typeCheckingContext
    if (typeParameters != null) {
        contextForTypeCheckingValue =
            contextForTypeCheckingValue.addLocalGenericTypes(genericTypes = typeParameters)
    }
    val checkedValue = value.typeCheck(
        errorCollector = errorCollector,
        typeCheckingContext = contextForTypeCheckingValue,
        expectedType = type
    )
    return member.copy(value = checkedValue as Expression.Lambda)
}
