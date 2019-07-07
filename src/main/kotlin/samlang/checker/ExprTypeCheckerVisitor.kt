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
            expectedType = expectedType, actualType = type, errorRange = expr.range
        )
        return CheckedExpr.Literal(type = type, literal = literalValue)
    }

    override fun visit(expr: This, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val type = ctx.getLocalValueType(name = "this") ?: throw IllegalThisError(range = expr.range)
        // don't need the return value because the type must be exact
        constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = type, errorRange = expr.range
        )
        return CheckedExpr.This(type = type)
    }

    override fun visit(expr: Variable, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val (position, name) = expr
        return ctx.getLocalValueType(name = name)
            ?.let { locallyInferredType ->
                val inferredType = constraintAwareTypeChecker.checkAndInfer(
                    expectedType = expectedType, actualType = locallyInferredType, errorRange = position
                )
                CheckedExpr.Variable(type = inferredType, name = name)
            }
            ?: throw UnresolvedNameError(unresolvedName = name, range = position)
    }

    override fun visit(expr: ModuleMember, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val (position, moduleName, memberName) = expr
        val locallyInferredType = ctx.getModuleFunctionType(
            module = moduleName, member = memberName, manager = manager, errorRange = position
        )
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredType, errorRange = position
        )
        return CheckedExpr.ModuleMember(type = constraintInferredType, moduleName = moduleName, memberName = memberName)
    }

    override fun visit(expr: TupleConstructor, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val (exprPos, exprList) = expr
        val checkedExprList = exprList.map { it.toChecked(ctx = ctx) }
        val locallyInferredType = CheckedTypeExpr.TupleType(mappings = checkedExprList.map { it.type })
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredType, errorRange = exprPos
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
                            range = namePos
                        )
                    }
                    checkedDeclarations.add(FieldConstructor.Field(type = type, name = name, expr = checkedExpr))
                }
                is RawExpr.ObjectConstructor.FieldConstructor.FieldShorthand -> {
                    val (namePos, name) = fieldDeclaration.name
                    val checkedExpr = Variable(range = namePos, name = name).toChecked(ctx = ctx)
                    val type = checkedExpr.type
                    if (declaredFieldTypes.put(key = name, value = type) != null) {
                        throw DuplicateFieldDeclarationError(
                            fieldName = name,
                            range = namePos
                        )
                    }
                    checkedDeclarations.add(FieldConstructor.FieldShorthand(type = type, name = name))
                }
            }
        }
        return declaredFieldTypes to checkedDeclarations
    }

    override fun visit(expr: ObjectConstructor, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val (typeParams, typeMappings) = ctx.getCurrentModuleObjectTypeDef(errorRange = expr.range)
        val checkedSpreadExpr = expr.spreadExpr?.toChecked(ctx = ctx)
        val (declaredFieldTypes, checkedDeclarations) = typeCheckFieldDeclarations(
            fieldDeclarations = expr.fieldDeclarations, ctx = ctx
        )
        val checkedMappings = hashMapOf<String, CheckedTypeExpr>()
        // used to quickly get the range where one declaration goes wrong
        val namePosMap = expr.fieldDeclarations.asSequence().map { val (p, n) = it.name; n to p }.toMap()
        val locallyInferredType = if (checkedSpreadExpr != null) {
            // In this case, keys does not need to perfectly match because we have fall back.
            for ((k, actualType) in declaredFieldTypes) {
                val namePos = namePosMap[k]!!
                val expectedFieldType = typeMappings[k] ?: throw ExtraFieldInObjectError(
                    extraField = k,
                    range = namePos
                )
                checkedMappings[k] = constraintAwareTypeChecker.checkAndInfer(
                    expectedType = expectedFieldType, actualType = actualType, errorRange = namePos
                )
            }
            checkedSpreadExpr.type
        } else {
            // In this case, all keys must perfectly match because we have no fall back
            if (typeMappings.keys != declaredFieldTypes.keys) {
                throw InconsistentFieldsInObjectError(
                    expectedFields = typeMappings.keys,
                    actualFields = declaredFieldTypes.keys,
                    range = expr.range
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
                    expectedType = reqType, actualType = actualType, errorRange = namePos
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
            expectedType = expectedType, actualType = locallyInferredType, errorRange = expr.range
        ) as CheckedTypeExpr.IdentifierType
        return CheckedExpr.ObjectConstructor(
            type = constraintInferredType,
            spreadExpr = checkedSpreadExpr,
            fieldDeclarations = enhancedFieldDeclarations
        )
    }

    override fun visit(expr: VariantConstructor, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val (typeParams, typeMappings) = ctx.getCurrentModuleVariantTypeDef(errorRange = expr.range)
        val (tagPos, tag) = expr.tag
        val checkedData = expr.data.toChecked(ctx = ctx)
        val associatedDataType = typeMappings[tag] ?: throw UnresolvedNameError(
            unresolvedName = tag, range = tagPos
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
            errorRange = expr.data.range
        )
        val constraintInferredTypeArgs = autoGeneratedUndecidedTypes?.map { undecidedType ->
            manager.reportCurrentUndecidedTypeReference(index = undecidedType.index)
        }
        val locallyInferredType = CheckedTypeExpr.IdentifierType(
            identifier = ctx.currentModule, typeArgs = constraintInferredTypeArgs
        )
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredType, errorRange = expr.range
        )
        return CheckedExpr.VariantConstructor(
            type = constraintInferredType as CheckedTypeExpr.IdentifierType,
            tag = tag,
            data = checkedData
        )
    }

    override fun visit(expr: FieldAccess, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val (typeParams, _) = ctx.getCurrentModuleObjectTypeDef(errorRange = expr.range)
        val expectedFieldType = CheckedTypeExpr.IdentifierType(
            identifier = ctx.currentModule,
            typeArgs = typeParams?.map { CheckedTypeExpr.FreeType }
        )
        val checkedAssignedExpr = expr.expr.toChecked(ctx = ctx, expectedType = expectedFieldType)
        val fieldMappings = ModuleTypeDefResolver.getTypeDef(
            identifierType = checkedAssignedExpr.type as CheckedTypeExpr.IdentifierType,
            ctx = ctx,
            errorRange = expr.expr.range,
            isFromObject = true
        )
        val (fieldPos, fieldName) = expr.fieldName
        val locallyInferredFieldType = fieldMappings[fieldName] ?: throw UnresolvedNameError(
            unresolvedName = fieldName,
            range = fieldPos
        )
        val constraintInferredFieldType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredFieldType, errorRange = expr.range
        )
        return CheckedExpr.FieldAccess(
            type = constraintInferredFieldType,
            expr = checkedAssignedExpr,
            fieldName = fieldName
        )
    }

    override fun visit(expr: MethodAccess, ctx: TypeCheckingContext, expectedType: CheckedTypeExpr): CheckedExpr {
        val (exprPos, exprToCallMethod, methodName) = expr
        val checkedExpr = exprToCallMethod.toChecked(ctx = ctx)
        val (checkedExprTypeIdentifier, checkedExprTypeArgs) = checkedExpr.type as? CheckedTypeExpr.IdentifierType
            ?: throw UnexpectedTypeKindError(
                expectedTypeKind = "identifier",
                actualType = checkedExpr.type,
                range = exprToCallMethod.range
            )
        val locallyInferredType = ctx.getModuleMethodType(
            module = checkedExprTypeIdentifier,
            typeArgs = checkedExprTypeArgs,
            methodName = methodName.name,
            manager = manager,
            errorRange = methodName.range
        )
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredType, errorRange = exprPos
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
            expectedType = expectedType, actualType = actuallyExpectedType, errorRange = expr.range
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
                range = expr.funExpr.range
            )
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredReturnType, errorRange = expr.range
        )
        checkedArgs.map { it.type }.zip(locallyInferredArgTypes).forEach { (e, a) ->
            constraintAwareTypeChecker.checkAndInfer(expectedType = e, actualType = a, errorRange = expr.range)
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
            expectedType = expectedType, actualType = checkedExpr.type, errorRange = position
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
            errorRange = expr.e1.range
        )
        constraintAwareTypeChecker.checkAndInfer(
            expectedType = constraintInferredType,
            actualType = checkedE2.type,
            errorRange = expr.e2.range
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
                    errorRange = matchedExpr.range,
                    isFromObject = false
                )
            }
            is CheckedTypeExpr.UndecidedType -> throw InsufficientTypeInferenceContextError(matchedExpr.range)
            else -> throw UnexpectedTypeKindError(
                expectedTypeKind = "identifier",
                actualType = checkedMatchedExprType,
                range = matchedExpr.range
            )
        }
        val unusedMappings = variantMappings.toMutableMap()
        val checkedMatchingList = matchingList.map { (_, tagWithPos, dataVarWithPos, correspondingExpr) ->
            val (tagPos, tag) = tagWithPos
            val mappingDataType = unusedMappings[tag]
                ?: throw UnresolvedNameError(unresolvedName = tag, range = tagPos)
            val newContext = dataVarWithPos?.let { d ->
                val (p, n) = d
                ctx.addLocalValueType(name = n, type = mappingDataType, errorRange = p)
            } ?: ctx
            unusedMappings.remove(key = tag)
            CheckedExpr.Match.VariantPatternToExpr(
                tag = tag,
                dataVariable = dataVarWithPos?.name,
                expr = correspondingExpr.toChecked(ctx = newContext, expectedType = expectedType)
            )
        }
        val finalType = checkedMatchingList.asSequence().map { it.expr.type }.fold(initial = expectedType) { exp, act ->
            constraintAwareTypeChecker.checkAndInfer(expectedType = exp, actualType = act, errorRange = position)
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
            currentContext = currentContext.addLocalValueType(name = name, type = checkedType, errorRange = pos)
            name to checkedType
        }
        val checkedBody = body.toChecked(ctx = currentContext)
        // merge a somewhat good locally inferred type
        val locallyInferredType = CheckedTypeExpr.FunctionType(
            argumentTypes = checkedArgs.map { it.second },
            returnType = checkedBody.type
        )
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredType, errorRange = position
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
                    range = assignedExpr.range
                )
                SizeMismatchError.check(
                    sizeDescription = "tuple",
                    expectedSize = tupleType.mappings.size,
                    actualSize = pattern.destructedNames.size,
                    range = assignedExpr.range
                )
                pattern.destructedNames.zip(tupleType.mappings).asSequence().mapNotNull { (nameWithPosOpt, t) ->
                    if (nameWithPosOpt == null) null else nameWithPosOpt to t
                }.fold(initial = ctx) { context, (nameWithPosOpt, t) ->
                    val (p, n) = nameWithPosOpt
                    context.addLocalValueType(name = n, type = t, errorRange = p)
                }
            }
            is RawPattern.ObjectPattern -> {
                val identifierType = checkedAssignedExprType as? CheckedTypeExpr.IdentifierType
                    ?: throw UnexpectedTypeKindError(
                        expectedTypeKind = "identifier",
                        actualType = checkedAssignedExprType,
                        range = assignedExpr.range
                    )
                if (identifierType.identifier != ctx.currentModule) {
                    throw IllegalOtherClassFieldAccess(
                        className = identifierType.identifier,
                        range = pattern.range
                    )
                }
                val fieldMappings = ModuleTypeDefResolver.getTypeDef(
                    identifierType = identifierType,
                    ctx = ctx,
                    errorRange = assignedExpr.range,
                    isFromObject = true
                )
                pattern.destructedNames.fold(initial = ctx) { context, (originalNameWithPos, renamedNameWithPos) ->
                    val (originalNamePos, originalName) = originalNameWithPos
                    val t = fieldMappings[originalName]
                        ?: throw UnresolvedNameError(unresolvedName = originalName, range = originalNamePos)
                    val nameWithPosToUse = renamedNameWithPos ?: originalNameWithPos
                    val (usedNamePos, usedName) = nameWithPosToUse
                    context.addLocalValueType(name = usedName, type = t, errorRange = usedNamePos)
                }
            }
            is RawPattern.VariablePattern -> {
                val (p, n) = pattern
                ctx.addLocalValueType(name = n, type = checkedAssignedExprType, errorRange = p)
            }
            is RawPattern.WildCardPattern -> ctx
        }
        val checkedNextExpr = if (nextExpr == null) {
            constraintAwareTypeChecker.checkAndInfer(
                expectedType = expectedType,
                actualType = CheckedTypeExpr.UnitType,
                errorRange = exprPos
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
