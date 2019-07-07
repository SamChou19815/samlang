package samlang.checker

import samlang.ast.*
import samlang.ast.Module.MemberDefinition
import samlang.ast.Module.TypeDefinition
import samlang.errors.CollisionError
import samlang.errors.IllegalMethodDefinitionError

internal object ProgramTypeChecker {

    private fun Collection<String>.checkNameCollision(range: Range) {
        val nameSet = hashSetOf<String>()
        forEach { name ->
            if (!nameSet.add(element = name)) {
                throw CollisionError(collidedName = Range.WithName(range = range, name = name))
            }
        }
    }

    fun typeCheck(program: Program, ctx: TypeCheckingContext): Program {
        val checkedModules = arrayListOf<Module>()
        var currentCtx = ctx
        for (module in program.modules) {
            val (checkedModule, newCtx) = typeCheck(module = module, ctx = currentCtx)
            checkedModules.add(element = checkedModule)
            currentCtx = newCtx
        }
        return Program(modules = checkedModules)
    }

    private fun typeCheck(module: Module, ctx: TypeCheckingContext): Pair<Module, TypeCheckingContext> {
        val (_, moduleNameRange, moduleName, moduleTypeDefinition, moduleMembers) = module
        val (checkedTypeDef, partialCtx) = createContextWithCurrentModuleDefOnly(
            moduleNameRange = moduleNameRange,
            moduleName = moduleName,
            moduleTypeDefinition = moduleTypeDefinition,
            ctx = ctx
        )
        val (fullCtx, partiallyCheckedMembers) = processCurrentContextWithMembersAndMethods(
            moduleRange = moduleNameRange,
            moduleName = moduleName,
            moduleMembers = moduleMembers,
            isUtilModule = moduleTypeDefinition == null,
            ctx = partialCtx
        )
        val checkedModule = module.copy(
            typeDefinition = checkedTypeDef,
            members = partiallyCheckedMembers.map { typeCheckMember(member = it, ctx = fullCtx) }
        )
        return checkedModule to fullCtx
    }

    private fun createContextWithCurrentModuleDefOnly(
        moduleNameRange: Range,
        moduleName: String,
        moduleTypeDefinition: TypeDefinition?,
        ctx: TypeCheckingContext
    ): Pair<TypeDefinition?, TypeCheckingContext> {
        // new context with type def but empty members and extensions
        return if (moduleTypeDefinition == null) {
            null to ctx.addNewEmptyUtilModule(name = moduleName, nameRange = moduleNameRange)
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
            ctx.addNewModuleTypeDefinition(
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
        ctx: TypeCheckingContext
    ): Pair<TypeCheckingContext, List<MemberDefinition>> {
        moduleMembers.map { it.name }.checkNameCollision(range = moduleRange)
        val partiallyCheckedMembers = moduleMembers.map { member ->
            val typeParameters = member.type.first
            typeParameters?.checkNameCollision(range = member.range)
            var newContext = typeParameters?.let { ctx.addLocalGenericTypes(genericTypes = it) } ?: ctx
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
        val newCtx = ctx.addMembersAndMethodsToCurrentModule(members = memberTypeInfo)
        return newCtx to partiallyCheckedMembers
    }

    private fun typeCheckExpression(
        expression: Expression,
        ctx: TypeCheckingContext,
        expectedType: Type
    ): Expression {
        val manager = UndecidedTypeManager()
        val visitor = ExpressionTypeCheckerVisitor(manager = manager)
        val checkedExpr = expression.accept(visitor = visitor, context = ctx to expectedType)
        return CheckedExprTypeFixer.fixType(
            expression = checkedExpr,
            expectedType = expectedType,
            manager = manager,
            ctx = ctx,
            errorRange = expression.range
        )
    }

    private fun typeCheckMember(
        member: MemberDefinition, ctx: TypeCheckingContext
    ): MemberDefinition {
        val (_, _, _, _, type, value) = member
        var ctxForTypeCheckingValue = if (member.isMethod) ctx.addThisType() else ctx
        val typeParameters = type.first
        if (typeParameters != null) {
            ctxForTypeCheckingValue = ctxForTypeCheckingValue.addLocalGenericTypes(genericTypes = typeParameters)
        }
        val checkedValue = typeCheckExpression(
            expression = value,
            ctx = ctxForTypeCheckingValue,
            expectedType = type.second
        ) as Expression.Lambda
        return member.copy(value = checkedValue)
    }

}
