package samlang.checker

import samlang.ast.Module
import samlang.ast.Module.MemberDefinition
import samlang.ast.Module.TypeDefinition
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
        createContextWithCurrentModuleDefinitionOnly(
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
            memberDefinition.typeCheck(errorCollector = errorCollector, typeCheckingContext = fullContext)
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

private fun checkNameCollision(namesWithRange: Collection<Pair<String, Range>>) {
    val nameSet = hashSetOf<String>()
    namesWithRange.forEach { (name, range) ->
        if (!nameSet.add(element = name)) {
            throw CollisionError(collidedName = name, range = range)
        }
    }
}

private fun createContextWithCurrentModuleDefinitionOnly(
    moduleNameRange: Range,
    moduleName: String,
    moduleTypeDefinition: TypeDefinition?,
    errorCollector: ErrorCollector,
    typeCheckingContext: TypeCheckingContext
): Pair<TypeDefinition?, TypeCheckingContext> {
    // new context with type def but empty members and extensions
    return if (moduleTypeDefinition == null) {
        null to typeCheckingContext.addNewEmptyUtilModule(name = moduleName, nameRange = moduleNameRange)
    } else {
        val (range, _, typeParameters, mappings) = moduleTypeDefinition
        // check name collisions
        errorCollector.returnNullOnCollectedError {
            typeParameters?.checkNameCollision(range = range)
            Unit
        } ?: return null to typeCheckingContext
        errorCollector.returnNullOnCollectedError {
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
            moduleTypeDefinition.copy(mappings = checkedMappings)
        }
    }
}

private fun processCurrentContextWithMembersAndMethods(
    moduleRange: Range,
    moduleName: String,
    moduleMembers: List<MemberDefinition>,
    isUtilModule: Boolean,
    typeCheckingContext: TypeCheckingContext
): Pair<TypeCheckingContext, List<MemberDefinition>> {
    checkNameCollision(namesWithRange = moduleMembers.map { it.name to it.nameRange })
    val partiallyCheckedMembers = moduleMembers.map { member ->
        val typeParameters = member.typeParameters
        typeParameters?.checkNameCollision(range = member.range)
        var newContext = typeParameters
            ?.let { typeCheckingContext.addLocalGenericTypes(genericTypes = it) }
            ?: typeCheckingContext
        if (member.isMethod) {
            if (isUtilModule) {
                throw IllegalMethodDefinitionError(name = moduleName, range = moduleRange)
            }
            val updatedNewContext = newContext.getCurrentModuleTypeDefinition()
                ?.typeParameters
                ?.let { newContext.addLocalGenericTypes(genericTypes = it) }
            if (updatedNewContext != null) {
                newContext = updatedNewContext
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
