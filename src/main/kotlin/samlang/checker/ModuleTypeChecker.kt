package samlang.checker

import samlang.ast.ClassDefinition
import samlang.ast.ClassDefinition.MemberDefinition
import samlang.ast.Module
import samlang.ast.Range
import samlang.errors.CollisionError
import samlang.util.createSourceOrFail

fun Module.typeCheck(typeCheckingContext: TypeCheckingContext = TypeCheckingContext.EMPTY): Module {
    val errorCollector = ErrorCollector()
    // First pass: add type definitions to classDefinitions
    var currentContext = classDefinitions.fold(initial = typeCheckingContext) { context, module ->
        errorCollector.returnNullOnCollectedError { context.addClassTypeDefinition(classDefinition = module) }
            ?: context
    }
    // Second pass: validating module's top level properties, excluding whether member's types are well-defined.
    val passedTypeValidationModules = classDefinitions.filter { module ->
        checkClassTopLevelValidity(
            typeDefinition = module.typeDefinition,
            moduleMembers = module.members,
            errorCollector = errorCollector,
            typeCheckingContext = currentContext
        )
    }
    // Third pass: add module's members to typing context.
    val partiallyCheckedModules = arrayListOf<ClassDefinition>()
    currentContext = passedTypeValidationModules.fold(initial = currentContext) { context, module ->
        val (partiallyCheckedMembers, contextWithModuleMembers) = getPartiallyCheckedMembersAndNewContext(
            moduleMembers = module.members,
            errorCollector = errorCollector,
            typeCheckingContext = context.copy(currentClass = module.name)
        )
        partiallyCheckedModules.add(element = module.copy(members = partiallyCheckedMembers))
        contextWithModuleMembers
    }
    // Fourth pass: type check all members' function body
    val checkedModules = partiallyCheckedModules.map { module ->
        module.copy(
            members = module.members.map { member ->
                typeCheckMemberDefinition(
                    memberDefinition = member,
                    errorCollector = errorCollector,
                    typeCheckingContext = currentContext.copy(currentClass = module.name)
                )
            }
        )
    }
    return createSourceOrFail(
        module = this.copy(classDefinitions = checkedModules),
        errors = errorCollector.collectedErrors
    )
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

/**
 * Check the validity of various toplevel properties of the given module's information, including
 * - whether [typeDefinition]'s type parameters and mappings have no name collision.
 * - whether [typeDefinition] is well defined.
 * - whether [moduleMembers] have no name collision.
 * - whether [moduleMembers]'s type parameters have no name collision.
 * - whether [moduleMembers] have methods when we are in a util module.
 * - whether [moduleMembers]'s types are well defined.
 *
 * If all checks are passed, return the updated type checking context with members information.
 */
private fun checkClassTopLevelValidity(
    typeDefinition: ClassDefinition.TypeDefinition,
    moduleMembers: List<MemberDefinition>,
    errorCollector: ErrorCollector,
    typeCheckingContext: TypeCheckingContext
): Boolean {
    var passedCheck = true
    // We consistently put passedCheck on the right hand side to avoid short-circuiting.
    // In this way, we can report as many errors as possible.
    val (range, _, typeParameters, mappings) = typeDefinition
    passedCheck = errorCollector.passCheck { typeParameters?.checkNameCollision(range = range) } && passedCheck
    passedCheck = errorCollector.passCheck { mappings.keys.checkNameCollision(range = range) } && passedCheck
    passedCheck = mappings.values.fold(initial = passedCheck) { previouslyPassedCheck, type ->
        errorCollector.passCheck {
            type.validate(context = typeCheckingContext, errorRange = range)
        } && previouslyPassedCheck
    }
    passedCheck = errorCollector.passCheck {
        checkNameCollision(namesWithRange = moduleMembers.map { it.name to it.nameRange })
    } && passedCheck
    passedCheck = moduleMembers.fold(initial = passedCheck) { previouslyPassedCheck, moduleMember ->
        errorCollector.passCheck {
            moduleMember.typeParameters?.checkNameCollision(range = moduleMember.range)
        } && previouslyPassedCheck
    }
    return passedCheck
}

private fun getPartiallyCheckedMembersAndNewContext(
    moduleMembers: List<MemberDefinition>,
    errorCollector: ErrorCollector,
    typeCheckingContext: TypeCheckingContext
): Pair<List<MemberDefinition>, TypeCheckingContext> {
    val partiallyCheckedMembers = moduleMembers.filter { member ->
        val typeParameters = member.typeParameters
        var newContext = typeParameters
            ?.let { typeCheckingContext.addLocalGenericTypes(genericTypes = it) }
            ?: typeCheckingContext
        if (member.isMethod) {
            val updatedNewContext = newContext.getCurrentModuleTypeDefinition()
                ?.typeParameters
                ?.let { newContext.addLocalGenericTypes(genericTypes = it) }
            if (updatedNewContext != null) {
                newContext = updatedNewContext
            }
        }
        errorCollector.passCheck { member.type.validate(context = newContext, errorRange = member.range) }
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
    val newContext =
        typeCheckingContext.addMembersAndMethodsToCurrentClass(members = memberTypeInfo)
    return partiallyCheckedMembers to newContext
}

private fun typeCheckMemberDefinition(
    memberDefinition: MemberDefinition,
    errorCollector: ErrorCollector,
    typeCheckingContext: TypeCheckingContext
): MemberDefinition {
    val (_, _, isMethod, _, _, typeParameters, type, parameters, body) = memberDefinition
    var contextForTypeCheckingBody = if (isMethod) typeCheckingContext.addThisType() else typeCheckingContext
    if (typeParameters != null) {
        contextForTypeCheckingBody =
            contextForTypeCheckingBody.addLocalGenericTypes(genericTypes = typeParameters)
    }
    contextForTypeCheckingBody = parameters.fold(initial = contextForTypeCheckingBody) { tempContext, parameter ->
        val parameterType = parameter.type.validate(context = tempContext, errorRange = parameter.typeRange)
        tempContext.addLocalValueType(name = parameter.name, type = parameterType, errorRange = parameter.nameRange)
    }
    val checkedBody = body.typeCheck(
        errorCollector = errorCollector,
        typeCheckingContext = contextForTypeCheckingBody,
        expectedType = type.returnType
    )
    return memberDefinition.copy(body = checkedBody)
}
