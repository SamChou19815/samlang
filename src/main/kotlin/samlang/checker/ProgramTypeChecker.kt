package samlang.checker

import samlang.ast.*
import samlang.ast.Module.MemberDefinition
import samlang.ast.Module.TypeDefinition
import samlang.errors.CollisionError
import samlang.errors.CompileTimeError
import samlang.errors.IllegalMethodDefinitionError
import samlang.util.Either

internal object ProgramTypeChecker {

    private fun Collection<String>.checkNameCollision(range: Range) {
        val nameSet = hashSetOf<String>()
        forEach { name ->
            if (!nameSet.add(element = name)) {
                throw CollisionError(collidedName = name, range = range)
            }
        }
    }

    fun typeCheck(program: Program, typeCheckingContext: TypeCheckingContext): Either<Program, List<CompileTimeError>> {
        val checkedModules = arrayListOf<Module>()
        var currentCtx = typeCheckingContext
        val errorCollector = ErrorCollector()
        for (module in program.modules) {
            val (checkedModule, newCtx) = typeCheck(
                module = module,
                errorCollector = errorCollector,
                typeCheckingContext = currentCtx
            )
            checkedModule?.let { checkedModules.add(element = it) }
            currentCtx = newCtx
        }
        val errors = errorCollector.collectedErrors
        return if (errors.isEmpty()) {
            Either.Left(v = Program(modules = checkedModules))
        } else {
            Either.Right(v = errors)
        }
    }

    fun getCheckedProgramOrThrow(program: Program, typeCheckingContext: TypeCheckingContext): Program =
        when (val result = typeCheck(program = program, typeCheckingContext = typeCheckingContext)) {
            is Either.Left -> result.v
            is Either.Right -> throw result.v[0]
        }

    private fun typeCheck(
        module: Module,
        errorCollector: ErrorCollector,
        typeCheckingContext: TypeCheckingContext
    ): Pair<Module?, TypeCheckingContext> {
        val (_, moduleNameRange, moduleName, moduleTypeDefinition, moduleMembers) = module
        val (checkedTypeDef, partialContext) = errorCollector.returnNullOnCollectedError {
            createContextWithCurrentModuleDefOnly(
                moduleNameRange = moduleNameRange,
                moduleName = moduleName,
                moduleTypeDefinition = moduleTypeDefinition,
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
        val checkedModule = module.copy(
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

    private fun createContextWithCurrentModuleDefOnly(
        moduleNameRange: Range,
        moduleName: String,
        moduleTypeDefinition: TypeDefinition?,
        typeCheckingContext: TypeCheckingContext
    ): Pair<TypeDefinition?, TypeCheckingContext> {
        // new context with type def but empty members and extensions
        return if (moduleTypeDefinition == null) {
            null to typeCheckingContext.addNewEmptyUtilModule(name = moduleName, nameRange = moduleNameRange)
        } else {
            val range = moduleTypeDefinition.range
            val typeParameters = moduleTypeDefinition.typeParameters
            val (isObject, mappings) = when (moduleTypeDefinition) {
                is TypeDefinition.ObjectType -> {
                    true to moduleTypeDefinition.mappings
                }
                is TypeDefinition.VariantType -> {
                    false to moduleTypeDefinition.mappings
                }
            }
            // check name collisions
            typeParameters?.checkNameCollision(range = range)
            mappings.keys.checkNameCollision(range = range)
            // create checked type def based on a temp
            typeCheckingContext.addNewModuleTypeDefinition(
                name = moduleName,
                nameRange = moduleNameRange,
                typeDefinitionRange = range,
                params = typeParameters
            ) { tempContext ->
                val checkedMappings =
                    mappings.mapValues { (_, type) -> type.validate(context = tempContext, errorRange = range) }
                if (isObject) {
                    TypeDefinition.ObjectType(
                        range = range,
                        typeParameters = typeParameters,
                        mappings = checkedMappings
                    )
                } else {
                    TypeDefinition.VariantType(
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
        moduleMembers: List<MemberDefinition>,
        isUtilModule: Boolean,
        typeCheckingContext: TypeCheckingContext
    ): Pair<TypeCheckingContext, List<MemberDefinition>> {
        moduleMembers.map { it.name }.checkNameCollision(range = moduleRange)
        val partiallyCheckedMembers = moduleMembers.map { member ->
            val typeParameters = member.type.first
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
            val type = member.type.second.validate(context = newContext, errorRange = member.range) as Type.FunctionType
            member.copy(type = typeParameters to type)
        }
        val memberTypeInfo = partiallyCheckedMembers.map { member ->
            Triple(
                first = member.name,
                second = member.isMethod,
                third = TypeCheckingContext.TypeInfo(
                    isPublic = member.isPublic,
                    typeParams = member.type.first,
                    type = member.type.second
                )
            )
        }
        val newCtx = typeCheckingContext.addMembersAndMethodsToCurrentModule(members = memberTypeInfo)
        return newCtx to partiallyCheckedMembers
    }

    private fun typeCheckMember(
        member: MemberDefinition, errorCollector: ErrorCollector, typeCheckingContext: TypeCheckingContext
    ): MemberDefinition {
        val (_, _, _, _, type, value) = member
        var contextForTypeCheckingValue =
            if (member.isMethod) typeCheckingContext.addThisType() else typeCheckingContext
        val typeParameters = type.first
        if (typeParameters != null) {
            contextForTypeCheckingValue =
                contextForTypeCheckingValue.addLocalGenericTypes(genericTypes = typeParameters)
        }
        val checkedValue = value.typeCheck(
            errorCollector = errorCollector,
            typeCheckingContext = contextForTypeCheckingValue,
            expectedType = type.second
        )
        return member.copy(value = checkedValue as Expression.Lambda)
    }

}
