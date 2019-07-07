package samlang.checker

import samlang.ast.checked.CheckedExpr
import samlang.ast.checked.CheckedModule
import samlang.ast.checked.CheckedModule.CheckedMemberDefinition
import samlang.ast.checked.CheckedModule.CheckedTypeDef
import samlang.ast.checked.CheckedProgram
import samlang.ast.checked.CheckedTypeExpr
import samlang.ast.raw.RawExpr
import samlang.ast.raw.RawModule
import samlang.ast.raw.RawProgram
import samlang.errors.CollisionError
import samlang.errors.IllegalMethodDefinitionError
import samlang.ast.common.Position

internal object ProgramTypeChecker {

    private data class PartiallyCheckedMemberDefinition(
        val isPublic: Boolean,
        val isMethod: Boolean,
        val typeParameters: List<String>?,
        val name: String,
        val typeAnnotation: CheckedTypeExpr.FunctionType,
        val value: RawExpr.Lambda
    )

    private fun List<Position.WithName>.checkNameCollision() {
        val nameSet = hashSetOf<String>()
        forEach { nameWithPos ->
            if (!nameSet.add(element = nameWithPos.name)) {
                throw CollisionError(collidedName = nameWithPos)
            }
        }
    }

    fun typeCheck(program: RawProgram, ctx: TypeCheckingContext): CheckedProgram {
        val checkedModules = arrayListOf<CheckedModule>()
        var currentCtx = ctx
        for (module in program.modules) {
            val (checkedModule, newCtx) = typeCheck(module = module, ctx = currentCtx)
            checkedModules.add(element = checkedModule)
            currentCtx = newCtx
        }
        return CheckedProgram(modules = checkedModules)
    }

    private fun typeCheck(module: RawModule, ctx: TypeCheckingContext): Pair<CheckedModule, TypeCheckingContext> {
        val (modulePosition, moduleNameWithPos, moduleTypeDef, moduleMembers) = module
        val (checkedTypeDef, partialCtx) = createContextWithCurrentModuleDefOnly(
            moduleNameWithPos = moduleNameWithPos, moduleTypeDef = moduleTypeDef, ctx = ctx
        )
        val (fullCtx, partiallyCheckedMembers) = processCurrentContextWithMembersAndMethods(
            modulePosition = modulePosition,
            moduleName = moduleNameWithPos.name,
            moduleMembers = moduleMembers,
            isUtilModule = moduleTypeDef == null,
            ctx = partialCtx
        )
        val checkedModule = CheckedModule(
            name = moduleNameWithPos.name,
            typeDef = checkedTypeDef,
            members = partiallyCheckedMembers.map { typeCheckMember(member = it, ctx = fullCtx) }
        )
        return checkedModule to fullCtx
    }

    private fun createContextWithCurrentModuleDefOnly(
        moduleNameWithPos: Position.WithName,
        moduleTypeDef: RawModule.RawTypeDef?,
        ctx: TypeCheckingContext
    ): Pair<CheckedTypeDef?, TypeCheckingContext> {
        // new context with type def but empty members and extensions
        val (moduleNamePos, moduleName) = moduleNameWithPos
        return if (moduleTypeDef == null) {
            null to ctx.addNewEmptyUtilModule(name = moduleName, namePosition = moduleNamePos)
        } else {
            val typeParams = moduleTypeDef.typeParams
            val (isObject, mappings) = when (moduleTypeDef) {
                is RawModule.RawTypeDef.ObjectType -> {
                    true to moduleTypeDef.mappings
                }
                is RawModule.RawTypeDef.VariantType -> {
                    false to moduleTypeDef.mappings
                }
            }
            // check name collisions
            typeParams?.checkNameCollision()
            mappings.map { (name, o) ->
                val (namePos, _) = o
                Position.WithName(position = namePos, name = name)
            }.checkNameCollision()
            val params = typeParams?.map { it.name }
            // create checked type def based on a temp
            ctx.addNewModuleTypeDef(name = moduleName, namePosition = moduleNamePos, params = params) { tempCtx ->
                val checkedMappings = mappings.map { (name, o) ->
                    val (_, rawType) = o
                    name to rawType.accept(visitor = RawToCheckedTypeVisitor, context = tempCtx)
                }.toMap()
                if (isObject) {
                    CheckedTypeDef.ObjectType(typeParams = params, mappings = checkedMappings)
                } else {
                    CheckedTypeDef.VariantType(typeParams = params, mappings = checkedMappings)
                }
            }
        }
    }

    private fun processCurrentContextWithMembersAndMethods(
        modulePosition: Position,
        moduleName: String,
        moduleMembers: List<RawModule.RawMemberDefinition>,
        isUtilModule: Boolean,
        ctx: TypeCheckingContext
    ): Pair<TypeCheckingContext, List<PartiallyCheckedMemberDefinition>> {
        moduleMembers.map { it.name }.checkNameCollision()
        val partiallyCheckedMembers = moduleMembers.map { member ->
            member.typeParameters?.checkNameCollision()
            val typeParams = member.typeParameters?.map { it.name }
            var newCtx = typeParams?.let { ctx.addLocalGenericTypes(genericTypes = it) } ?: ctx
            if (member.isMethod) {
                if (isUtilModule) {
                    throw IllegalMethodDefinitionError(
                        name = moduleName,
                        position = modulePosition
                    )
                }
                val updatedNewCtx = newCtx.getCurrentModuleTypeDef()
                    ?.typeParams
                    ?.let { newCtx.addLocalGenericTypes(genericTypes = it) }
                if (updatedNewCtx != null) {
                    newCtx = updatedNewCtx
                }
            }
            val type = member.typeAnnotation.accept(visitor = RawToCheckedTypeVisitor, context = newCtx)
            PartiallyCheckedMemberDefinition(
                isPublic = member.isPublic,
                isMethod = member.isMethod,
                typeParameters = typeParams,
                name = member.name.name,
                typeAnnotation = type as CheckedTypeExpr.FunctionType,
                value = member.value
            )
        }
        val memberTypeInfo = partiallyCheckedMembers.map { member ->
            Triple(
                first = member.name,
                second = member.isMethod,
                third = TypeCheckingContext.TypeInfo(
                    isPublic = member.isPublic,
                    typeParams = member.typeParameters,
                    type = member.typeAnnotation
                )
            )
        }
        val newCtx = ctx.addMembersAndMethodsToCurrentModule(members = memberTypeInfo)
        return newCtx to partiallyCheckedMembers
    }

    private fun typeCheckExpr(expr: RawExpr, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val manager = UndecidedTypeManager()
        val visitor = ExprTypeCheckerVisitor(manager = manager)
        val checkedExpr = expr.accept(visitor = visitor, context = ctx to expectedType)
        return CheckedExprTypeFixer.fixType(
            expr = checkedExpr,
            expectedType = expectedType,
            manager = manager,
            ctx = ctx,
            errorPosition = expr.position
        )
    }

    private fun typeCheckMember(
        member: PartiallyCheckedMemberDefinition, ctx: TypeCheckingContext
    ): CheckedMemberDefinition {
        val (isPublic, isMethod, typeParameters, name, typeAnnotation, value) = member
        val type = member.typeParameters to member.typeAnnotation
        var ctxForTypeCheckingValue = if (member.isMethod) ctx.addThisType() else ctx
        if (typeParameters != null) {
            ctxForTypeCheckingValue = ctxForTypeCheckingValue.addLocalGenericTypes(genericTypes = typeParameters)
        }
        val checkedValue = typeCheckExpr(
            expr = value,
            ctx = ctxForTypeCheckingValue,
            expectedType = typeAnnotation
        ) as CheckedExpr.Lambda
        return CheckedMemberDefinition(
            isPublic = isPublic,
            isMethod = isMethod,
            name = name,
            type = type,
            value = checkedValue
        )
    }

}
