package samlang.checker

import samlang.ast.lang.ClassDefinition
import samlang.ast.lang.ClassDefinition.MemberDefinition
import samlang.ast.lang.Module
import samlang.ast.common.Range
import samlang.errors.CollisionError

internal class ModuleTypeChecker(val errorCollector: ErrorCollector) {

    fun typeCheck(module: Module, typeCheckingContext: TypeCheckingContext): Pair<Module, TypeCheckingContext> {
        // First pass: add type definitions to classDefinitions
        var currentContext = module.classDefinitions.fold(initial = typeCheckingContext) { context, definition ->
            errorCollector.returnNullOnCollectedError { context.addClassTypeDefinition(classDefinition = definition) }
                ?: context
        }
        // Second pass: validating module's top level properties, excluding whether member's types are well-defined.
        val passedTypeValidationClasses = module.classDefinitions.filter { classDefinition ->
            checkClassTopLevelValidity(
                typeDefinition = classDefinition.typeDefinition,
                classMembers = classDefinition.members,
                typeCheckingContext = currentContext
            )
        }
        // Third pass: add module's members to typing context.
        val partiallyCheckedClasses = arrayListOf<ClassDefinition>()
        currentContext = passedTypeValidationClasses.fold(initial = currentContext) { context, classDefinition ->
            val (partiallyCheckedMembers, contextWithModuleMembers) = getPartiallyCheckedMembersAndNewContext(
                classMembers = classDefinition.members,
                typeCheckingContext = context.copy(currentClass = classDefinition.name)
            )
            partiallyCheckedClasses.add(element = classDefinition.copy(members = partiallyCheckedMembers))
            contextWithModuleMembers
        }
        // Fourth pass: type check all members' function body
        val checkedClasses = partiallyCheckedClasses.map { classDefinition ->
            classDefinition.copy(
                members = classDefinition.members.map { member ->
                    typeCheckMemberDefinition(
                        memberDefinition = member,
                        typeCheckingContext = currentContext.copy(currentClass = classDefinition.name)
                    )
                }
            )
        }
        return module.copy(classDefinitions = checkedClasses) to currentContext
    }

    /**
     * Check the validity of various toplevel properties of the given module's information, including
     * - whether [typeDefinition]'s type parameters and mappings have no name collision.
     * - whether [typeDefinition] is well defined.
     * - whether [classMembers] have no name collision.
     * - whether [classMembers]'s type parameters have no name collision.
     * - whether [classMembers] have methods when we are in a util module.
     * - whether [classMembers]'s types are well defined.
     *
     * If all checks are passed, return the updated type checking context with members information.
     */
    private fun checkClassTopLevelValidity(
        typeDefinition: ClassDefinition.TypeDefinition,
        classMembers: List<MemberDefinition>,
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
            checkNameCollision(namesWithRange = classMembers.map { it.name to it.nameRange })
        } && passedCheck
        passedCheck = classMembers.fold(initial = passedCheck) { previouslyPassedCheck, moduleMember ->
            errorCollector.passCheck {
                moduleMember.typeParameters?.checkNameCollision(range = moduleMember.range)
            } && previouslyPassedCheck
        }
        return passedCheck
    }

    private fun getPartiallyCheckedMembersAndNewContext(
        classMembers: List<MemberDefinition>,
        typeCheckingContext: TypeCheckingContext
    ): Pair<List<MemberDefinition>, TypeCheckingContext> {
        val partiallyCheckedMembers = classMembers.filter { member ->
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
}
