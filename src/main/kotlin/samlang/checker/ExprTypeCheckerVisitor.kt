package samlang.checker

import samlang.ast.checked.CheckedExpr
import samlang.ast.checked.CheckedExpr.ObjectConstructor.FieldConstructor
import samlang.ast.checked.CheckedPattern
import samlang.ast.checked.CheckedTypeExpr
import samlang.ast.common.BinaryOperator
import samlang.ast.common.UnaryOperator
import samlang.ast.raw.RawExpr
import samlang.ast.raw.RawExpr.*
import samlang.ast.raw.RawPattern
import samlang.errors.*

internal class ExprTypeCheckerVisitor(private val manager: UndecidedTypeManager) : RawExprTypeCheckerVisitor {

    private val constraintAwareTypeChecker: ConstraintAwareTypeChecker = ConstraintAwareTypeChecker(manager = manager)

    private fun RawExpr.toChecked(
        ctx: TypeCheckingContext, expectedType: CheckedTypeExpr = CheckedTypeExpr.FreeType
    ): CheckedExpr = accept(visitor = this@ExprTypeCheckerVisitor, context = ctx to expectedType)

    override fun visit(expr: Literal, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val literalValue = expr.literal
        val type = when (literalValue) {
            is samlang.ast.common.Literal.UnitLiteral -> CheckedTypeExpr.UnitType
            is samlang.ast.common.Literal.IntLiteral -> CheckedTypeExpr.IntType
            is samlang.ast.common.Literal.StringLiteral -> CheckedTypeExpr.StringType
            is samlang.ast.common.Literal.BoolLiteral -> CheckedTypeExpr.BoolType
        }
        // don't need the return value because the type must be exact
        constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = type, errorPosition = expr.position
        )
        return CheckedExpr.Literal(type = type, literal = literalValue)
    }

    override fun visit(expr: This, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val type = ctx.getLocalValueType(name = "this") ?: throw IllegalThisError(position = expr.position)
        // don't need the return value because the type must be exact
        constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = type, errorPosition = expr.position
        )
        return CheckedExpr.This(type = type)
    }

    override fun visit(expr: Variable, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val (position, name) = expr
        return ctx.getLocalValueType(name = name)
            ?.let { locallyInferredType ->
                val inferredType = constraintAwareTypeChecker.checkAndInfer(
                    expectedType = expectedType, actualType = locallyInferredType, errorPosition = position
                )
                CheckedExpr.Variable(type = inferredType, name = name)
            }
            ?: throw UnresolvedNameError(unresolvedName = name, position = position)
    }

    override fun visit(expr: ModuleMember, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val (position, moduleName, memberName) = expr
        val locallyInferredType = ctx.getModuleFunctionType(
            module = moduleName, member = memberName, manager = manager, errorPosition = position
        )
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredType, errorPosition = position
        )
        return CheckedExpr.ModuleMember(type = constraintInferredType, moduleName = moduleName, memberName = memberName)
    }

    override fun visit(expr: TupleConstructor, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val (exprPos, exprList) = expr
        val checkedExprList = exprList.map { it.toChecked(ctx = ctx) }
        val locallyInferredType = CheckedTypeExpr.TupleType(mappings = checkedExprList.map { it.type })
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredType, errorPosition = exprPos
        )
        return CheckedExpr.TupleConstructor(
            type = constraintInferredType as CheckedTypeExpr.TupleType,
            exprList = checkedExprList
        )
    }

    private fun typeCheckFieldDeclarations(
        fieldDeclarations: List<ObjectConstructor.FieldConstructor>, ctx: TypeCheckingContext
    ): Pair<Map<String, CheckedTypeExpr>, List<CheckedExpr.ObjectConstructor.FieldConstructor>> {
        val declaredFieldTypes = mutableMapOf<String, CheckedTypeExpr>()
        val checkedDeclarations = arrayListOf<CheckedExpr.ObjectConstructor.FieldConstructor>()
        for (fieldDeclaration in fieldDeclarations) {
            when (fieldDeclaration) {
                is RawExpr.ObjectConstructor.FieldConstructor.Field -> {
                    val checkedExpr = fieldDeclaration.expr.toChecked(ctx = ctx)
                    val type = checkedExpr.type
                    val (namePos, name) = fieldDeclaration.name
                    if (declaredFieldTypes.put(key = name, value = type) != null) {
                        throw DuplicateFieldDeclarationError(
                            fieldName = name,
                            position = namePos
                        )
                    }
                    checkedDeclarations.add(FieldConstructor.Field(type = type, name = name, expr = checkedExpr))
                }
                is RawExpr.ObjectConstructor.FieldConstructor.FieldShorthand -> {
                    val (namePos, name) = fieldDeclaration.name
                    val checkedExpr = Variable(position = namePos, name = name).toChecked(ctx = ctx)
                    val type = checkedExpr.type
                    if (declaredFieldTypes.put(key = name, value = type) != null) {
                        throw DuplicateFieldDeclarationError(
                            fieldName = name,
                            position = namePos
                        )
                    }
                    checkedDeclarations.add(FieldConstructor.FieldShorthand(type = type, name = name))
                }
            }
        }
        return declaredFieldTypes to checkedDeclarations
    }

    override fun visit(expr: ObjectConstructor, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val (typeParams, typeMappings) = ctx.getCurrentModuleObjectTypeDef(errorPosition = expr.position)
        val checkedSpreadExpr = expr.spreadExpr?.toChecked(ctx = ctx)
        val (declaredFieldTypes, checkedDeclarations) = typeCheckFieldDeclarations(
            fieldDeclarations = expr.fieldDeclarations, ctx = ctx
        )
        val checkedMappings = hashMapOf<String, CheckedTypeExpr>()
        // used to quickly get the position where one declaration goes wrong
        val namePosMap = expr.fieldDeclarations.asSequence().map { val (p, n) = it.name; n to p }.toMap()
        val locallyInferredType = if (checkedSpreadExpr != null) {
            // In this case, keys does not need to perfectly match because we have fall back.
            for ((k, actualType) in declaredFieldTypes) {
                val namePos = namePosMap[k]!!
                val expectedFieldType = typeMappings[k] ?: throw ExtraFieldInObjectError(
                    extraField = k,
                    position = namePos
                )
                checkedMappings[k] = constraintAwareTypeChecker.checkAndInfer(
                    expectedType = expectedFieldType, actualType = actualType, errorPosition = namePos
                )
            }
            checkedSpreadExpr.type
        } else {
            // In this case, all keys must perfectly match because we have no fall back
            if (typeMappings.keys != declaredFieldTypes.keys) {
                throw InconsistentFieldsInObjectError(
                    expectedFields = typeMappings.keys,
                    actualFields = declaredFieldTypes.keys,
                    position = expr.position
                )
            }
            val (genericsResolvedTypeMappings, autoGeneratedUndecidedTypes) = typeParams?.let { params ->
                CheckedTypeDeparameterizer.convert(
                    typeMappings = typeMappings,
                    typeParams = params,
                    manager = manager
                )
            } ?: typeMappings to null
            for ((k, actualType) in declaredFieldTypes) {
                val reqType = genericsResolvedTypeMappings[k]!!
                val namePos = namePosMap[k]!!
                checkedMappings[k] = constraintAwareTypeChecker.checkAndInfer(
                    expectedType = reqType, actualType = actualType, errorPosition = namePos
                )
            }
            val constraintInferredTypeArgs = autoGeneratedUndecidedTypes?.map { undecidedType ->
                manager.reportCurrentUndecidedTypeReference(index = undecidedType.index)
            }
            CheckedTypeExpr.IdentifierType(identifier = ctx.currentModule, typeArgs = constraintInferredTypeArgs)
        }
        val enhancedFieldDeclarations = checkedDeclarations.map { dec ->
            val betterType = checkedMappings[dec.name] ?: error(message = "Impossible Case")
            dec.copyWithNewType(type = betterType)
        }
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredType, errorPosition = expr.position
        ) as CheckedTypeExpr.IdentifierType
        return CheckedExpr.ObjectConstructor(
            type = constraintInferredType,
            spreadExpr = checkedSpreadExpr,
            fieldDeclarations = enhancedFieldDeclarations
        )
    }

    override fun visit(expr: VariantConstructor, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val (typeParams, typeMappings) = ctx.getCurrentModuleVariantTypeDef(errorPosition = expr.position)
        val (tagPos, tag) = expr.tag
        val checkedData = expr.data.toChecked(ctx = ctx)
        val associatedDataType = typeMappings[tag] ?: throw UnresolvedNameError(
            unresolvedName = tag, position = tagPos
        )
        val (genericsResolvedAssociatedDataType, autoGeneratedUndecidedTypes) = typeParams?.let { params ->
            CheckedTypeDeparameterizer.convert(
                typeExpr = associatedDataType,
                typeParams = params,
                manager = manager
            )
        } ?: associatedDataType to null
        constraintAwareTypeChecker.checkAndInfer(
            expectedType = genericsResolvedAssociatedDataType,
            actualType = checkedData.type,
            errorPosition = expr.data.position
        )
        val constraintInferredTypeArgs = autoGeneratedUndecidedTypes?.map { undecidedType ->
            manager.reportCurrentUndecidedTypeReference(index = undecidedType.index)
        }
        val locallyInferredType = CheckedTypeExpr.IdentifierType(
            identifier = ctx.currentModule, typeArgs = constraintInferredTypeArgs
        )
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredType, errorPosition = expr.position
        )
        return CheckedExpr.VariantConstructor(
            type = constraintInferredType as CheckedTypeExpr.IdentifierType,
            tag = tag,
            data = checkedData
        )
    }

    override fun visit(expr: MethodAccess, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val (exprPos, exprToCallMethod, methodName) = expr
        val checkedExpr = exprToCallMethod.toChecked(ctx = ctx)
        val (checkedExprTypeIdentifier, checkedExprTypeArgs) = checkedExpr.type as? CheckedTypeExpr.IdentifierType
            ?: throw UnexpectedTypeKindError(
                expectedTypeKind = "identifier",
                actualType = checkedExpr.type,
                position = exprToCallMethod.position
            )
        val locallyInferredType = ctx.getModuleMethodType(
            module = checkedExprTypeIdentifier,
            typeArgs = checkedExprTypeArgs,
            methodName = methodName.name,
            manager = manager,
            errorPosition = methodName.position
        )
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredType, errorPosition = exprPos
        )
        return CheckedExpr.MethodAccess(
            type = constraintInferredType as CheckedTypeExpr.FunctionType,
            expr = checkedExpr,
            methodName = methodName.name
        )
    }

    override fun visit(expr: Unary, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val actuallyExpectedType = when (expr.operator) {
            UnaryOperator.NEG -> CheckedTypeExpr.IntType
            UnaryOperator.NOT -> CheckedTypeExpr.BoolType
        }
        constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = actuallyExpectedType, errorPosition = expr.position
        )
        val checkedExpr = expr.expr.toChecked(ctx = ctx, expectedType = actuallyExpectedType)
        return CheckedExpr.Unary(type = actuallyExpectedType, operator = expr.operator, expr = checkedExpr)
    }

    override fun visit(expr: Panic, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val checkedExpr = expr.expr.toChecked(ctx = ctx, expectedType = CheckedTypeExpr.StringType)
        val type = if (expectedType != CheckedTypeExpr.FreeType) expectedType else manager.allocateAnUndecidedType()
        return CheckedExpr.Panic(type = type, expr = checkedExpr)
    }

    override fun visit(expr: FunApp, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val checkedArgs = expr.arguments.map { it.toChecked(ctx = ctx) }
        val expectedTypeForFunction = CheckedTypeExpr.FunctionType(
            argumentTypes = checkedArgs.map { it.type },
            returnType = expectedType
        )
        val checkedFunExpr = expr.funExpr.toChecked(ctx = ctx, expectedType = expectedTypeForFunction)
        val (locallyInferredArgTypes, locallyInferredReturnType) = checkedFunExpr.type as? CheckedTypeExpr.FunctionType
            ?: throw UnexpectedTypeKindError(
                expectedTypeKind = "function",
                actualType = checkedFunExpr.type,
                position = expr.funExpr.position
            )
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredReturnType, errorPosition = expr.position
        )
        checkedArgs.map { it.type }.zip(locallyInferredArgTypes).forEach { (e, a) ->
            constraintAwareTypeChecker.checkAndInfer(expectedType = e, actualType = a, errorPosition = expr.position)
        }
        return CheckedExpr.FunApp(type = constraintInferredType, funExpr = checkedFunExpr, arguments = checkedArgs)
    }

    override fun visit(expr: Binary, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val (position, e1, op, e2) = expr
        val checkedExpr = when (op) {
            BinaryOperator.MUL, BinaryOperator.DIV, BinaryOperator.MOD, BinaryOperator.PLUS, BinaryOperator.MINUS -> {
                CheckedExpr.Binary(
                    type = CheckedTypeExpr.IntType,
                    e1 = e1.toChecked(ctx = ctx, expectedType = CheckedTypeExpr.IntType),
                    operator = op,
                    e2 = e2.toChecked(ctx = ctx, expectedType = CheckedTypeExpr.IntType)
                )
            }
            BinaryOperator.LT, BinaryOperator.LE, BinaryOperator.GT, BinaryOperator.GE -> {
                CheckedExpr.Binary(
                    type = CheckedTypeExpr.BoolType,
                    e1 = e1.toChecked(ctx = ctx, expectedType = CheckedTypeExpr.IntType),
                    operator = op,
                    e2 = e2.toChecked(ctx = ctx, expectedType = CheckedTypeExpr.IntType)
                )
            }
            BinaryOperator.EQ, BinaryOperator.NE -> {
                val checkedE1 = e1.toChecked(ctx = ctx)
                val checkedE2 = e2.toChecked(ctx = ctx, expectedType = checkedE1.type)
                CheckedExpr.Binary(
                    type = CheckedTypeExpr.BoolType,
                    e1 = checkedE1,
                    operator = op,
                    e2 = checkedE2
                )
            }
            BinaryOperator.AND, BinaryOperator.OR -> {
                CheckedExpr.Binary(
                    type = CheckedTypeExpr.BoolType,
                    e1 = e1.toChecked(ctx = ctx, expectedType = CheckedTypeExpr.BoolType),
                    operator = op,
                    e2 = e2.toChecked(ctx = ctx, expectedType = CheckedTypeExpr.BoolType)
                )
            }
        }
        constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = checkedExpr.type, errorPosition = position
        )
        return checkedExpr
    }

    override fun visit(expr: IfElse, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val checkedBoolExpr = expr.boolExpr.toChecked(ctx = ctx, expectedType = CheckedTypeExpr.BoolType)
        val checkedE1 = expr.e1.toChecked(ctx = ctx, expectedType = expectedType)
        val checkedE2 = expr.e2.toChecked(ctx = ctx, expectedType = expectedType)
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType,
            actualType = checkedE1.type,
            errorPosition = expr.e1.position
        )
        constraintAwareTypeChecker.checkAndInfer(
            expectedType = constraintInferredType,
            actualType = checkedE2.type,
            errorPosition = expr.e2.position
        )
        return CheckedExpr.IfElse(
            type = constraintInferredType,
            boolExpr = checkedBoolExpr,
            e1 = checkedE1,
            e2 = checkedE2
        )
    }

    override fun visit(expr: Match, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val (position, matchedExpr, matchingList) = expr
        val checkedMatchedExpr = matchedExpr.toChecked(ctx = ctx)
        val variantMappings = when (val checkedMatchedExprType = checkedMatchedExpr.type) {
            is CheckedTypeExpr.IdentifierType -> {
                ModuleTypeDefResolver.getTypeDef(
                    identifierType = checkedMatchedExprType,
                    ctx = ctx,
                    errorPosition = matchedExpr.position,
                    isFromObject = false
                )
            }
            is CheckedTypeExpr.UndecidedType -> throw InsufficientTypeInferenceContextError(matchedExpr.position)
            else -> throw UnexpectedTypeKindError(
                expectedTypeKind = "identifier",
                actualType = checkedMatchedExprType,
                position = matchedExpr.position
            )
        }
        val unusedMappings = variantMappings.toMutableMap()
        val checkedMatchingList = matchingList.map { (_, tagWithPos, dataVarWithPos, correspondingExpr) ->
            val (tagPos, tag) = tagWithPos
            val mappingDataType = unusedMappings[tag]
                ?: throw UnresolvedNameError(unresolvedName = tag, position = tagPos)
            val newContext = dataVarWithPos?.let { d ->
                val (p, n) = d
                ctx.addLocalValueType(name = n, type = mappingDataType, errorPosition = p)
            } ?: ctx
            unusedMappings.remove(key = tag)
            CheckedExpr.Match.VariantPatternToExpr(
                tag = tag,
                dataVariable = dataVarWithPos?.name,
                expr = correspondingExpr.toChecked(ctx = newContext, expectedType = expectedType)
            )
        }
        val finalType = checkedMatchingList.asSequence().map { it.expr.type }.fold(initial = expectedType) { exp, act ->
            constraintAwareTypeChecker.checkAndInfer(expectedType = exp, actualType = act, errorPosition = position)
        }
        return CheckedExpr.Match(
            type = finalType,
            matchedExpr = checkedMatchedExpr,
            matchingList = checkedMatchingList
        )
    }

    override fun visit(expr: Lambda, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val (position, arguments, body) = expr
        // check duplicated name among themselves first
        val names = hashSetOf<String>()
        for ((nameWithPos, _) in arguments) {
            if (!names.add(nameWithPos.name)) {
                throw CollisionError(collidedName = nameWithPos)
            }
        }
        // setting up types and update context
        var currentContext = ctx
        val checkedArgs = arguments.map { (nameWithPos, typeOpt) ->
            val (pos, name) = nameWithPos
            val checkedType = typeOpt
                ?.accept(visitor = RawToCheckedTypeVisitor, context = ctx)
                ?: manager.allocateAnUndecidedType()
            currentContext = currentContext.addLocalValueType(name = name, type = checkedType, errorPosition = pos)
            name to checkedType
        }
        val checkedBody = body.toChecked(ctx = currentContext)
        // merge a somewhat good locally inferred type
        val locallyInferredType = CheckedTypeExpr.FunctionType(
            argumentTypes = checkedArgs.map { it.second },
            returnType = checkedBody.type
        )
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredType, errorPosition = position
        ) as CheckedTypeExpr.FunctionType
        return CheckedExpr.Lambda(
            type = constraintInferredType,
            arguments = checkedArgs,
            body = checkedBody
        )
    }

    override fun visit(expr: Val, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val (exprPos, pattern, typeAnnotation, assignedExpr, nextExpr) = expr
        val assignedExprExpectedType = typeAnnotation
            ?.accept(visitor = RawToCheckedTypeVisitor, context = ctx)
            ?: CheckedTypeExpr.FreeType
        val checkedAssignedExpr = assignedExpr.toChecked(ctx = ctx, expectedType = assignedExprExpectedType)
        val checkedAssignedExprType = checkedAssignedExpr.type
        val newContext = when (pattern) {
            is RawPattern.TuplePattern -> {
                val tupleType = checkedAssignedExprType as? CheckedTypeExpr.TupleType ?: throw UnexpectedTypeKindError(
                    expectedTypeKind = "tuple",
                    actualType = checkedAssignedExprType,
                    position = assignedExpr.position
                )
                SizeMismatchError.check(
                    sizeDescription = "tuple",
                    expectedSize = tupleType.mappings.size,
                    actualSize = pattern.destructedNames.size,
                    position = assignedExpr.position
                )
                pattern.destructedNames.zip(tupleType.mappings).asSequence().mapNotNull { (nameWithPosOpt, t) ->
                    if (nameWithPosOpt == null) null else nameWithPosOpt to t
                }.fold(initial = ctx) { context, (nameWithPosOpt, t) ->
                    val (p, n) = nameWithPosOpt
                    context.addLocalValueType(name = n, type = t, errorPosition = p)
                }
            }
            is RawPattern.ObjectPattern -> {
                checkedAssignedExprType as? CheckedTypeExpr.IdentifierType
                    ?: throw UnexpectedTypeKindError(
                        expectedTypeKind = "identifier",
                        actualType = checkedAssignedExprType,
                        position = assignedExpr.position
                    )
                val fieldMappings = ModuleTypeDefResolver.getTypeDef(
                    identifierType = checkedAssignedExprType,
                    ctx = ctx,
                    errorPosition = assignedExpr.position,
                    isFromObject = true
                )
                pattern.destructedNames.fold(initial = ctx) { context, (originalNameWithPos, renamedNameWithPos) ->
                    val (originalNamePos, originalName) = originalNameWithPos
                    val t = fieldMappings[originalName]
                        ?: throw UnresolvedNameError(unresolvedName = originalName, position = originalNamePos)
                    val nameWithPosToUse = renamedNameWithPos ?: originalNameWithPos
                    val (usedNamePos, usedName) = nameWithPosToUse
                    context.addLocalValueType(name = usedName, type = t, errorPosition = usedNamePos)
                }
            }
            is RawPattern.VariablePattern -> {
                val (p, n) = pattern
                ctx.addLocalValueType(name = n, type = checkedAssignedExprType, errorPosition = p)
            }
            is RawPattern.WildCardPattern -> ctx
        }
        val checkedNextExpr = if (nextExpr == null) {
            constraintAwareTypeChecker.checkAndInfer(
                expectedType = expectedType,
                actualType = CheckedTypeExpr.UnitType,
                errorPosition = exprPos
            )
            null
        } else {
            nextExpr.toChecked(ctx = newContext, expectedType = expectedType)
        }
        val checkedPattern = when (pattern) {
            is RawPattern.TuplePattern -> CheckedPattern.TuplePattern(
                destructedNames = pattern.destructedNames.map { it?.name }
            )
            is RawPattern.ObjectPattern -> CheckedPattern.ObjectPattern(
                destructedNames = pattern.destructedNames.map { (o, r) -> o.name to r?.name }
            )
            is RawPattern.VariablePattern -> CheckedPattern.VariablePattern(name = pattern.name)
            is RawPattern.WildCardPattern -> CheckedPattern.WildcardPattern
        }
        return CheckedExpr.Val(
            type = checkedNextExpr?.type ?: CheckedTypeExpr.UnitType,
            pattern = checkedPattern,
            assignedExpr = checkedAssignedExpr,
            nextExpr = checkedNextExpr
        )
    }

}
