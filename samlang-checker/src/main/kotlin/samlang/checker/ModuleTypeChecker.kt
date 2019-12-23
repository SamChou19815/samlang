package samlang.checker

import kotlinx.collections.immutable.toPersistentSet
import samlang.ast.common.Range
import samlang.ast.common.TypeDefinition
import samlang.ast.lang.ClassDefinition.MemberDefinition
import samlang.ast.lang.Module

internal class ModuleTypeChecker(val errorCollector: ErrorCollector) {

    fun typeCheck(module: Module, typeCheckingContext: TypeCheckingContext): Module {
        checkNameCollision(namesWithRange = module.classDefinitions.map { it.name to it.nameRange })
        val checkedClasses = module.classDefinitions.map { classDefinition ->
            val currentClass = classDefinition.name
            val context = typeCheckingContext.copy(
                currentClass = currentClass,
                localGenericTypes = classDefinition.typeDefinition.typeParameters.toPersistentSet()
            )
            // First pass: validating module's top level properties, excluding whether member's types are well-defined.
            checkClassTopLevelValidity(
                typeDefinition = classDefinition.typeDefinition,
                classMembers = classDefinition.members,
                typeCheckingContext = context
            )
            // Second pass: type check all members' function body
            val members = classDefinition.members
            partiallyCheckMembers(classMembers = members, typeCheckingContext = context)
            val checkedMembers = members.mapNotNull { member ->
                typeCheckMemberDefinition(memberDefinition = member, typeCheckingContext = context)
            }
            classDefinition.copy(members = checkedMembers)
        }
        return module.copy(classDefinitions = checkedClasses)
    }

    /**
     * Check the validity of various toplevel properties of the given module's information, including
     * - whether [typeDefinition]'s type parameters and mappings have no name collision.
     * - whether [typeDefinition] is well defined.
     * - whether [classMembers] have no name collision.
     * - whether [classMembers]'s type parameters have no name collision.
     * - whether [classMembers] have methods when we are in a util module.
     * - whether [classMembers]'s types are well defined.
     */
    private fun checkClassTopLevelValidity(
        typeDefinition: TypeDefinition,
        classMembers: List<MemberDefinition>,
        typeCheckingContext: TypeCheckingContext
    ) {
        // We consistently put passedCheck on the right hand side to avoid short-circuiting.
        // In this way, we can report as many errors as possible.
        val (range, _, typeParameters, mappings) = typeDefinition
        typeParameters.checkNameCollision(range = range)
        mappings.keys.checkNameCollision(range = range)
        mappings.values.forEach { type ->
            type.validate(context = typeCheckingContext, errorCollector = errorCollector, errorRange = range)
        }
        checkNameCollision(namesWithRange = classMembers.map { it.name to it.nameRange })
        classMembers.forEach { moduleMember ->
            moduleMember.typeParameters.checkNameCollision(range = moduleMember.range)
        }
    }

    private fun partiallyCheckMembers(classMembers: List<MemberDefinition>, typeCheckingContext: TypeCheckingContext) {
        classMembers.forEach { member ->
            val typeParameters = member.typeParameters
            var newContext = typeCheckingContext.addLocalGenericTypes(genericTypes = typeParameters)
            if (member.isMethod) {
                val updatedNewContext = newContext.getCurrentModuleTypeDefinition()
                    ?.typeParameters
                    ?.let { newContext.addLocalGenericTypes(genericTypes = it) }
                if (updatedNewContext != null) {
                    newContext = updatedNewContext
                }
            }
            member.type.validate(context = newContext, errorCollector = errorCollector, errorRange = member.range)
        }
    }

    private fun typeCheckMemberDefinition(
        memberDefinition: MemberDefinition,
        typeCheckingContext: TypeCheckingContext
    ): MemberDefinition? {
        val (_, _, isMethod, _, _, typeParameters, type, parameters, body) = memberDefinition
        var contextForTypeCheckingBody = if (isMethod) typeCheckingContext.addThisType() else typeCheckingContext
        contextForTypeCheckingBody = contextForTypeCheckingBody.addLocalGenericTypes(genericTypes = typeParameters)
        contextForTypeCheckingBody = parameters.fold(initial = contextForTypeCheckingBody) { tempContext, parameter ->
            val parameterType = parameter.type.validate(
                context = tempContext, errorCollector = errorCollector, errorRange = parameter.typeRange
            ) ?: return null
            tempContext.addLocalValueType(name = parameter.name, type = parameterType) {
                errorCollector.reportCollisionError(name = parameter.name, range = parameter.nameRange)
            }
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
                errorCollector.reportCollisionError(name = name, range = range)
            }
        }
    }

    private fun checkNameCollision(namesWithRange: Collection<Pair<String, Range>>) {
        val nameSet = hashSetOf<String>()
        namesWithRange.forEach { (name, range) ->
            if (!nameSet.add(element = name)) {
                errorCollector.reportCollisionError(name = name, range = range)
            }
        }
    }
}
