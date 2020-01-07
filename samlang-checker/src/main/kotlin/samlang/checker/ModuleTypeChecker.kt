package samlang.checker

import kotlinx.collections.immutable.PersistentMap
import kotlinx.collections.immutable.toPersistentSet
import samlang.ast.common.Range
import samlang.ast.common.TypeDefinition
import samlang.ast.lang.ClassDefinition.MemberDefinition
import samlang.ast.lang.Module

internal class ModuleTypeChecker(private val errorCollector: ErrorCollector) {
    fun typeCheck(module: Module, classes: PersistentMap<String, GlobalTypingContext.ClassType>): Module {
        checkNameCollision(namesWithRange = module.classDefinitions.map { it.name to it.nameRange })
        val checkedClasses = module.classDefinitions.map { classDefinition ->
            val currentClass = classDefinition.name
            val accessibleGlobalTypingContext = AccessibleGlobalTypingContext(
                classes = classes,
                typeParameters = classDefinition.typeDefinition.typeParameters.toPersistentSet(),
                currentClass = currentClass
            )
            // First pass: validating module's top level properties, excluding whether member's types are well-defined.
            checkClassTopLevelValidity(
                typeDefinition = classDefinition.typeDefinition,
                classMembers = classDefinition.members,
                accessibleGlobalTypingContext = accessibleGlobalTypingContext
            )
            // Second pass: type check all members' function body
            val members = classDefinition.members
            partiallyCheckMembers(classMembers = members, accessibleGlobalTypingContext = accessibleGlobalTypingContext)
            val checkedMembers = members.mapNotNull { member ->
                typeCheckMemberDefinition(
                    memberDefinition = member,
                    accessibleGlobalTypingContext = accessibleGlobalTypingContext
                )
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
        accessibleGlobalTypingContext: AccessibleGlobalTypingContext
    ) {
        // We consistently put passedCheck on the right hand side to avoid short-circuiting.
        // In this way, we can report as many errors as possible.
        val (range, _, typeParameters, mappings) = typeDefinition
        typeParameters.checkNameCollision(range = range)
        mappings.keys.checkNameCollision(range = range)
        mappings.values.forEach { type ->
            validateType(
                type = type,
                identifierTypeValidator = accessibleGlobalTypingContext,
                errorCollector = errorCollector,
                errorRange = range
            )
        }
        checkNameCollision(namesWithRange = classMembers.map { it.name to it.nameRange })
        classMembers.forEach { moduleMember ->
            moduleMember.typeParameters.checkNameCollision(range = moduleMember.range)
        }
    }

    private fun partiallyCheckMembers(
        classMembers: List<MemberDefinition>,
        accessibleGlobalTypingContext: AccessibleGlobalTypingContext
    ) {
        classMembers.forEach { member ->
            val typeParameters = member.typeParameters
            var accessibleGlobalTypingContextWithAdditionalTypeParameters = accessibleGlobalTypingContext
                .withAdditionalTypeParameters(typeParameters = typeParameters)
            if (member.isMethod) {
                val updatedNewContext =
                    accessibleGlobalTypingContextWithAdditionalTypeParameters.getCurrentModuleTypeDefinition()
                        ?.typeParameters?.let {
                        accessibleGlobalTypingContextWithAdditionalTypeParameters.withAdditionalTypeParameters(
                            typeParameters = it
                        )
                    }
                if (updatedNewContext != null) {
                    accessibleGlobalTypingContextWithAdditionalTypeParameters = updatedNewContext
                }
            }
            validateType(
                type = member.type,
                identifierTypeValidator = accessibleGlobalTypingContextWithAdditionalTypeParameters,
                errorCollector = errorCollector,
                errorRange = member.range
            )
        }
    }

    private fun typeCheckMemberDefinition(
        memberDefinition: MemberDefinition,
        accessibleGlobalTypingContext: AccessibleGlobalTypingContext
    ): MemberDefinition? {
        val localTypingContext = LocalTypingContext()
        val (_, _, isMethod, _, _, typeParameters, type, parameters, body) = memberDefinition
        if (isMethod) {
            localTypingContext.addLocalValueType(name = "this", type = accessibleGlobalTypingContext.thisType) {
                error(message = "Should not collide")
            }
        }
        val accessibleGlobalTypingContextWithAdditionalTypeParameters = accessibleGlobalTypingContext
            .withAdditionalTypeParameters(typeParameters = typeParameters)
        parameters.forEach { parameter ->
            val parameterType = parameter.type
            val parameterIsValid = validateType(
                type = parameterType,
                identifierTypeValidator = accessibleGlobalTypingContextWithAdditionalTypeParameters,
                errorCollector = errorCollector,
                errorRange = parameter.typeRange
            )
            if (!parameterIsValid) {
                return null
            }
            localTypingContext.addLocalValueType(name = parameter.name, type = parameterType) {
                errorCollector.reportCollisionError(name = parameter.name, range = parameter.nameRange)
            }
        }
        val checkedBody = body.typeCheck(
            errorCollector = errorCollector,
            accessibleGlobalTypingContext = accessibleGlobalTypingContextWithAdditionalTypeParameters,
            localTypingContext = localTypingContext,
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
