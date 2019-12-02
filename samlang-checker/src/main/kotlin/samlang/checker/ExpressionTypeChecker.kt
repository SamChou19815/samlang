package samlang.checker

import samlang.ast.common.BinaryOperator.AND
import samlang.ast.common.BinaryOperator.DIV
import samlang.ast.common.BinaryOperator.EQ
import samlang.ast.common.BinaryOperator.GE
import samlang.ast.common.BinaryOperator.GT
import samlang.ast.common.BinaryOperator.LE
import samlang.ast.common.BinaryOperator.LT
import samlang.ast.common.BinaryOperator.MINUS
import samlang.ast.common.BinaryOperator.MOD
import samlang.ast.common.BinaryOperator.MUL
import samlang.ast.common.BinaryOperator.NE
import samlang.ast.common.BinaryOperator.OR
import samlang.ast.common.BinaryOperator.PLUS
import samlang.ast.common.Type
import samlang.ast.common.Type.FunctionType
import samlang.ast.common.Type.IdentifierType
import samlang.ast.common.Type.TupleType
import samlang.ast.common.Type.UndecidedType
import samlang.ast.common.TypeDefinitionType.OBJECT
import samlang.ast.common.TypeDefinitionType.VARIANT
import samlang.ast.lang.Expression
import samlang.ast.lang.Expression.Binary
import samlang.ast.lang.Expression.ClassMember
import samlang.ast.lang.Expression.FieldAccess
import samlang.ast.lang.Expression.FunctionApplication
import samlang.ast.lang.Expression.IfElse
import samlang.ast.lang.Expression.Lambda
import samlang.ast.lang.Expression.Literal
import samlang.ast.lang.Expression.Match
import samlang.ast.lang.Expression.MethodAccess
import samlang.ast.lang.Expression.ObjectConstructor
import samlang.ast.lang.Expression.ObjectConstructor.FieldConstructor
import samlang.ast.lang.Expression.Panic
import samlang.ast.lang.Expression.This
import samlang.ast.lang.Expression.TupleConstructor
import samlang.ast.lang.Expression.Unary
import samlang.ast.lang.Expression.Val
import samlang.ast.lang.Expression.Variable
import samlang.ast.lang.Expression.VariantConstructor
import samlang.ast.lang.Pattern
import samlang.errors.CollisionError
import samlang.errors.DuplicateFieldDeclarationError
import samlang.errors.ExtraFieldInObjectError
import samlang.errors.IllegalOtherClassFieldAccess
import samlang.errors.IllegalThisError
import samlang.errors.InconsistentFieldsInObjectError
import samlang.errors.InsufficientTypeInferenceContextError
import samlang.errors.SizeMismatchError
import samlang.errors.UnexpectedTypeKindError
import samlang.errors.UnresolvedNameError
import samlang.errors.UnsupportedClassTypeDefinitionError

internal fun Expression.typeCheck(
    errorCollector: ErrorCollector,
    typeCheckingContext: TypeCheckingContext,
    expectedType: Type
): Expression {
    val resolution = TypeResolution()
    val visitor = ExpressionTypeCheckerVisitor(resolution = resolution, errorCollector = errorCollector)
    val checkedExpression =
        this.toChecked(visitor = visitor, context = typeCheckingContext, expectedType = expectedType)
    if (errorCollector.collectedErrors.isNotEmpty()) {
        return checkedExpression
    }
    return checkedExpression.fixType(
        expectedType = expectedType,
        resolution = resolution,
        errorCollector = errorCollector,
        typeCheckingContext = typeCheckingContext
    )
}

private fun Expression.toChecked(
    visitor: ExpressionTypeCheckerVisitor,
    context: TypeCheckingContext,
    expectedType: Type
): Expression =
    visitor.errorCollector.returnNullOnCollectedError {
        this.accept(visitor = visitor, context = context to expectedType)
    } ?: this.replaceTypeWithExpectedType(expectedType = expectedType)

private class ExpressionTypeCheckerVisitor(
    private val resolution: TypeResolution,
    val errorCollector: ErrorCollector
) : TypeCheckerVisitor {

    private val constraintAwareTypeChecker: ConstraintAwareTypeChecker =
        ConstraintAwareTypeChecker(resolution = resolution)

    private fun Expression.toChecked(ctx: TypeCheckingContext, expectedType: Type = this.type): Expression =
        this.toChecked(visitor = this@ExpressionTypeCheckerVisitor, context = ctx, expectedType = expectedType)

    override fun visit(expression: Literal, ctx: TypeCheckingContext, expectedType: Type): Expression {
        constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = expression.type, errorRange = expression.range
        )
        // Literals are already well typed if it passed the previous check.
        return expression
    }

    override fun visit(expression: This, ctx: TypeCheckingContext, expectedType: Type): Expression {
        val type = ctx.getLocalValueType(name = "this") ?: throw IllegalThisError(range = expression.range)
        // don't need the return value because the type must be exact
        constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = type, errorRange = expression.range
        )
        return expression.copy(type = type)
    }

    override fun visit(expression: Variable, ctx: TypeCheckingContext, expectedType: Type): Expression {
        val (range, _, name) = expression
        val locallyInferredType =
            ctx.getLocalValueType(name = name) ?: throw UnresolvedNameError(unresolvedName = name, range = range)
        val inferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredType, errorRange = range
        )
        return expression.copy(type = inferredType)
    }

    override fun visit(expression: ClassMember, ctx: TypeCheckingContext, expectedType: Type): Expression {
        val (range, _, _, moduleName, memberName) = expression
        val (locallyInferredType, undecidedTypeArguments) = ctx.getClassFunctionType(
            module = moduleName, member = memberName, errorRange = range
        )
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredType, errorRange = range
        )
        return expression.copy(type = constraintInferredType, typeArguments = undecidedTypeArguments)
    }

    override fun visit(
        expression: TupleConstructor,
        ctx: TypeCheckingContext,
        expectedType: Type
    ): Expression {
        val (range, impreciseTupleType, expressionList) = expression
        val checkedExpressionList = expressionList.map { it.toChecked(ctx = ctx) }
        val locallyInferredType = impreciseTupleType.copy(mappings = checkedExpressionList.map { it.type })
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredType, errorRange = range
        )
        return expression.copy(
            type = constraintInferredType as TupleType,
            expressionList = checkedExpressionList
        )
    }

    private fun typeCheckFieldDeclarations(
        fieldDeclarations: List<FieldConstructor>,
        ctx: TypeCheckingContext
    ): Pair<Map<String, Type>, List<FieldConstructor>> {
        val declaredFieldTypes = mutableMapOf<String, Type>()
        val checkedDeclarations = arrayListOf<FieldConstructor>()
        for (fieldDeclaration in fieldDeclarations) {
            when (fieldDeclaration) {
                is FieldConstructor.Field -> {
                    val checkedExpression = fieldDeclaration.expression.toChecked(ctx = ctx)
                    val type = checkedExpression.type
                    val name = fieldDeclaration.name
                    if (declaredFieldTypes.put(key = name, value = type) != null) {
                        throw DuplicateFieldDeclarationError(
                            fieldName = name,
                            range = fieldDeclaration.range
                        )
                    }
                    checkedDeclarations.add(fieldDeclaration.copy(type = type, expression = checkedExpression))
                }
                is FieldConstructor.FieldShorthand -> {
                    val name = fieldDeclaration.name
                    val range = fieldDeclaration.range
                    val checkedExpr = Variable(range = range, type = Type.undecided(), name = name)
                        .toChecked(ctx = ctx)
                    val type = checkedExpr.type
                    if (declaredFieldTypes.put(key = name, value = type) != null) {
                        throw DuplicateFieldDeclarationError(
                            fieldName = name,
                            range = fieldDeclaration.range
                        )
                    }
                    checkedDeclarations.add(fieldDeclaration.copy(type = type))
                }
            }
        }
        return declaredFieldTypes to checkedDeclarations
    }

    override fun visit(
        expression: ObjectConstructor,
        ctx: TypeCheckingContext,
        expectedType: Type
    ): Expression {
        val (range, _, spreadExpression, fieldDeclarations) = expression
        val (_, _, typeParameters, typeMappings) = ctx.getCurrentModuleTypeDefinition()
            ?.takeIf { it.type == OBJECT }
            ?: throw UnsupportedClassTypeDefinitionError(typeDefinitionType = OBJECT, range = range)
        val checkedSpreadExpression = spreadExpression?.toChecked(ctx = ctx)
        val (declaredFieldTypes, checkedDeclarations) = typeCheckFieldDeclarations(
            fieldDeclarations = fieldDeclarations, ctx = ctx
        )
        val checkedMappings = hashMapOf<String, Type>()
        // used to quickly get the range where one declaration goes wrong
        val nameRangeMap = fieldDeclarations.asSequence().map { it.name to it.range }.toMap()
        val locallyInferredType = if (checkedSpreadExpression != null) {
            // In this case, keys does not need to perfectly match because we have fall back.
            for ((k, actualType) in declaredFieldTypes) {
                val nameRange = nameRangeMap[k] ?: error("Name not found!")
                val expectedFieldType = typeMappings[k] ?: throw ExtraFieldInObjectError(
                    extraField = k,
                    range = nameRange
                )
                checkedMappings[k] = constraintAwareTypeChecker.checkAndInfer(
                    expectedType = expectedFieldType, actualType = actualType, errorRange = nameRange
                )
            }
            checkedSpreadExpression.type
        } else {
            // In this case, all keys must perfectly match because we have no fall back
            if (typeMappings.keys != declaredFieldTypes.keys) {
                throw InconsistentFieldsInObjectError(
                    expectedFields = typeMappings.keys,
                    actualFields = declaredFieldTypes.keys,
                    range = expression.range
                )
            }
            val (genericsResolvedTypeMappings, autoGeneratedUndecidedTypes) = undecideTypeParameters(
                typeMappings = typeMappings,
                typeParameters = typeParameters
            )
            for ((k, actualType) in declaredFieldTypes) {
                val reqType = genericsResolvedTypeMappings[k] ?: error("Name not found!")
                val nameRange = nameRangeMap[k] ?: error("Name not found!")
                checkedMappings[k] = constraintAwareTypeChecker.checkAndInfer(
                    expectedType = reqType, actualType = actualType, errorRange = nameRange
                )
            }
            val constraintInferredTypeArguments = autoGeneratedUndecidedTypes.map { undecidedType ->
                resolution.getPartiallyResolvedType(undecidedType = undecidedType)
            }
            IdentifierType(
                identifier = ctx.currentClass,
                typeArguments = constraintInferredTypeArguments
            )
        }
        val enhancedFieldDeclarations = checkedDeclarations.map { dec ->
            val betterType = checkedMappings[dec.name] ?: error(message = "Impossible Case")
            dec.copyWithNewType(type = betterType)
        }
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredType, errorRange = range
        ) as IdentifierType
        return ObjectConstructor(
            range = range,
            type = constraintInferredType,
            spreadExpression = checkedSpreadExpression,
            fieldDeclarations = enhancedFieldDeclarations
        )
    }

    override fun visit(
        expression: VariantConstructor,
        ctx: TypeCheckingContext,
        expectedType: Type
    ): Expression {
        val (range, _, tag, data) = expression
        val (_, _, typeParameters, typeMappings) = ctx.getCurrentModuleTypeDefinition()
            ?.takeIf { it.type == VARIANT }
            ?: throw UnsupportedClassTypeDefinitionError(typeDefinitionType = VARIANT, range = range)
        val checkedData = data.toChecked(ctx = ctx)
        val associatedDataType = typeMappings[tag] ?: throw UnresolvedNameError(unresolvedName = tag, range = range)
        val (genericsResolvedAssociatedDataType, autoGeneratedUndecidedTypes) = undecideTypeParameters(
            type = associatedDataType,
            typeParameters = typeParameters
        )
        constraintAwareTypeChecker.checkAndInfer(
            expectedType = genericsResolvedAssociatedDataType,
            actualType = checkedData.type,
            errorRange = data.range
        )
        val constraintInferredTypeArgs = autoGeneratedUndecidedTypes.map { undecidedType ->
            resolution.getPartiallyResolvedType(undecidedType = undecidedType)
        }
        val locallyInferredType = IdentifierType(
            identifier = ctx.currentClass, typeArguments = constraintInferredTypeArgs
        )
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredType, errorRange = range
        )
        return expression.copy(type = constraintInferredType, data = checkedData)
    }

    override fun visit(expression: FieldAccess, ctx: TypeCheckingContext, expectedType: Type): Expression {
        val (range, _, assignedExpression, fieldName) = expression
        val (_, _, typeParameters, _) = ctx.getCurrentModuleTypeDefinition()
            ?.takeIf { it.type == OBJECT }
            ?: throw UnsupportedClassTypeDefinitionError(typeDefinitionType = OBJECT, range = range)
        val expectedFieldType = IdentifierType(
            identifier = ctx.currentClass,
            typeArguments = Type.undecidedList(number = typeParameters.size)
        )
        val checkedAssignedExpression = assignedExpression.toChecked(ctx = ctx, expectedType = expectedFieldType)
        val fieldMappings = ClassTypeDefinitionResolver.getTypeDefinition(
            identifierType = checkedAssignedExpression.type as IdentifierType,
            context = ctx,
            typeDefinitionType = OBJECT,
            errorRange = assignedExpression.range
        )
        val locallyInferredFieldType = fieldMappings[fieldName] ?: throw UnresolvedNameError(
            unresolvedName = fieldName,
            range = range
        )
        val constraintInferredFieldType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredFieldType, errorRange = expression.range
        )
        return expression.copy(type = constraintInferredFieldType, expression = checkedAssignedExpression)
    }

    override fun visit(expression: MethodAccess, ctx: TypeCheckingContext, expectedType: Type): Expression {
        val (range, _, expressionToCallMethod, methodName) = expression
        val checkedExpression = expressionToCallMethod.toChecked(ctx = ctx)
        val (checkedExprTypeIdentifier, checkedExprTypeArguments) = checkedExpression.type as? IdentifierType
            ?: throw UnexpectedTypeKindError(
                expectedTypeKind = "identifier",
                actualType = checkedExpression.type,
                range = expressionToCallMethod.range
            )
        val locallyInferredType = ctx.getClassMethodType(
            module = checkedExprTypeIdentifier,
            typeArguments = checkedExprTypeArguments,
            methodName = methodName,
            errorRange = range
        )
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredType, errorRange = range
        )
        return expression.copy(type = constraintInferredType, expression = checkedExpression)
    }

    override fun visit(expression: Unary, ctx: TypeCheckingContext, expectedType: Type): Expression {
        val (range, type, _, subExpression) = expression
        constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = type, errorRange = range
        )
        val checkedSubExpression = subExpression.toChecked(ctx = ctx, expectedType = type)
        return expression.copy(expression = checkedSubExpression)
    }

    override fun visit(expression: Panic, ctx: TypeCheckingContext, expectedType: Type): Expression {
        val (range, type, subExpression) = expression
        val checkedSubExpression =
            subExpression.toChecked(ctx = ctx, expectedType = Type.string)
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = type, errorRange = range
        )
        return expression.copy(type = constraintInferredType, expression = checkedSubExpression)
    }

    override fun visit(
        expression: FunctionApplication,
        ctx: TypeCheckingContext,
        expectedType: Type
    ): Expression {
        val (range, _, functionExpression, arguments) = expression
        val checkedArguments = arguments.map { it.toChecked(ctx = ctx) }
        val expectedTypeForFunction = FunctionType(
            argumentTypes = checkedArguments.map { it.type },
            returnType = expectedType
        )
        val checkedFunctionExpression = functionExpression.toChecked(ctx = ctx, expectedType = expectedTypeForFunction)
        val (locallyInferredArgTypes, locallyInferredReturnType) = checkedFunctionExpression.type as? FunctionType
            ?: throw UnexpectedTypeKindError(
                expectedTypeKind = "function",
                actualType = checkedFunctionExpression.type,
                range = functionExpression.range
            )
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredReturnType, errorRange = range
        )
        checkedArguments.map { it.type }.zip(locallyInferredArgTypes).forEach { (e, a) ->
            constraintAwareTypeChecker.checkAndInfer(expectedType = e, actualType = a, errorRange = range)
        }
        return FunctionApplication(
            range = range,
            type = constraintInferredType,
            functionExpression = checkedFunctionExpression,
            arguments = checkedArguments
        )
    }

    override fun visit(expression: Binary, ctx: TypeCheckingContext, expectedType: Type): Expression {
        val (range, _, e1, op, e2) = expression
        val checkedExpression = when (op) {
            MUL, DIV, MOD, PLUS, MINUS -> expression.copy(
                e1 = e1.toChecked(ctx = ctx, expectedType = Type.int),
                e2 = e2.toChecked(ctx = ctx, expectedType = Type.int)
            )
            LT, LE, GT, GE -> expression.copy(
                e1 = e1.toChecked(ctx = ctx, expectedType = Type.int),
                e2 = e2.toChecked(ctx = ctx, expectedType = Type.int)
            )
            EQ, NE -> {
                val checkedE1 = e1.toChecked(ctx = ctx)
                val checkedE2 = e2.toChecked(ctx = ctx, expectedType = checkedE1.type)
                expression.copy(e1 = checkedE1, e2 = checkedE2)
            }
            AND, OR -> expression.copy(
                e1 = e1.toChecked(ctx = ctx, expectedType = Type.bool),
                e2 = e2.toChecked(ctx = ctx, expectedType = Type.bool)
            )
        }
        constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = checkedExpression.type, errorRange = range
        )
        return checkedExpression
    }

    override fun visit(expression: IfElse, ctx: TypeCheckingContext, expectedType: Type): Expression {
        val (_, _, boolExpression, e1, e2) = expression
        val checkedBoolExpression = boolExpression.toChecked(ctx = ctx, expectedType = Type.bool)
        val checkedE1 = e1.toChecked(ctx = ctx, expectedType = expectedType)
        val checkedE2 = e2.toChecked(ctx = ctx, expectedType = expectedType)
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType,
            actualType = checkedE1.type,
            errorRange = e1.range
        )
        constraintAwareTypeChecker.checkAndInfer(
            expectedType = constraintInferredType,
            actualType = checkedE2.type,
            errorRange = e2.range
        )
        return expression.copy(
            type = constraintInferredType,
            boolExpression = checkedBoolExpression,
            e1 = checkedE1,
            e2 = checkedE2
        )
    }

    override fun visit(expression: Match, ctx: TypeCheckingContext, expectedType: Type): Expression {
        val (range, _, matchedExpression, matchingList) = expression
        val checkedMatchedExpression = matchedExpression.toChecked(ctx = ctx)
        val variantMappings = when (val checkedMatchedExpressionType = checkedMatchedExpression.type) {
            is IdentifierType -> {
                ClassTypeDefinitionResolver.getTypeDefinition(
                    identifierType = checkedMatchedExpressionType,
                    context = ctx,
                    typeDefinitionType = VARIANT,
                    errorRange = matchedExpression.range
                )
            }
            is UndecidedType -> throw InsufficientTypeInferenceContextError(checkedMatchedExpression.range)
            else -> throw UnexpectedTypeKindError(
                expectedTypeKind = "identifier",
                actualType = checkedMatchedExpressionType,
                range = matchedExpression.range
            )
        }
        val unusedMappings = variantMappings.toMutableMap()
        val checkedMatchingList = matchingList.map { (range, tag, dataVariable, correspondingExpr) ->
            val mappingDataType = unusedMappings[tag]
                ?: throw UnresolvedNameError(unresolvedName = tag, range = range)
            val newContext = dataVariable?.let {
                ctx.addLocalValueType(name = it, type = mappingDataType, errorRange = range)
            } ?: ctx
            unusedMappings.remove(key = tag)
            Match.VariantPatternToExpr(
                range = range,
                tag = tag,
                dataVariable = dataVariable,
                expression = correspondingExpr.toChecked(ctx = newContext, expectedType = expectedType)
            )
        }
        val finalType =
            checkedMatchingList.asSequence().map { it.expression.type }.fold(initial = expectedType) { exp, act ->
                constraintAwareTypeChecker.checkAndInfer(expectedType = exp, actualType = act, errorRange = range)
            }
        return Match(
            range = range,
            type = finalType,
            matchedExpression = checkedMatchedExpression,
            matchingList = checkedMatchingList
        )
    }

    override fun visit(expression: Lambda, ctx: TypeCheckingContext, expectedType: Type): Expression {
        val (range, functionType, arguments, body) = expression
        // check duplicated name among themselves first
        val names = hashSetOf<String>()
        for ((name, _) in arguments) {
            if (!names.add(name)) {
                throw CollisionError(collidedName = name, range = range)
            }
        }
        // setting up types and update context
        var currentContext = ctx
        val checkedArguments = arguments.map { (argumentName, argumentType) ->
            val checkedArgumentType = argumentType.validate(context = ctx, errorRange = range)
            currentContext =
                currentContext.addLocalValueType(name = argumentName, type = checkedArgumentType, errorRange = range)
            argumentName to checkedArgumentType
        }
        val checkedBody = body.toChecked(ctx = currentContext, expectedType = functionType.returnType)
        // merge a somewhat good locally inferred type
        val locallyInferredType = functionType.copy(
            argumentTypes = checkedArguments.map { it.second },
            returnType = checkedBody.type
        )
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = expectedType, actualType = locallyInferredType, errorRange = range
        ) as FunctionType
        return Lambda(
            range = range,
            type = constraintInferredType,
            parameters = checkedArguments,
            body = checkedBody
        )
    }

    override fun visit(expression: Val, ctx: TypeCheckingContext, expectedType: Type): Expression {
        val (range, _, pattern, typeAnnotation, assignedExpr, nextExpr) = expression
        val checkedAssignedExpr = assignedExpr.toChecked(ctx = ctx, expectedType = typeAnnotation)
        val checkedAssignedExprType = checkedAssignedExpr.type
        val newContext = when (pattern) {
            is Pattern.TuplePattern -> {
                val tupleType = checkedAssignedExprType as? TupleType ?: throw UnexpectedTypeKindError(
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
                }.fold(initial = ctx) { context, (name, elementType) ->
                    context.addLocalValueType(name = name, type = elementType, errorRange = pattern.range)
                }
            }
            is Pattern.ObjectPattern -> {
                val identifierType = checkedAssignedExprType as? IdentifierType
                    ?: throw UnexpectedTypeKindError(
                        expectedTypeKind = "identifier",
                        actualType = checkedAssignedExprType,
                        range = assignedExpr.range
                    )
                if (identifierType.identifier != ctx.currentClass) {
                    throw IllegalOtherClassFieldAccess(
                        className = identifierType.identifier,
                        range = pattern.range
                    )
                }
                val fieldMappings = ClassTypeDefinitionResolver.getTypeDefinition(
                    identifierType = identifierType,
                    context = ctx,
                    typeDefinitionType = OBJECT,
                    errorRange = assignedExpr.range
                )
                pattern.destructedNames.fold(initial = ctx) { context, (originalName, renamedName) ->
                    val fieldType = fieldMappings[originalName]
                        ?: throw UnresolvedNameError(unresolvedName = originalName, range = pattern.range)
                    val nameToBeUsed = renamedName ?: originalName
                    context.addLocalValueType(name = nameToBeUsed, type = fieldType, errorRange = pattern.range)
                }
            }
            is Pattern.VariablePattern -> {
                val (p, n) = pattern
                ctx.addLocalValueType(name = n, type = checkedAssignedExprType, errorRange = p)
            }
            is Pattern.WildCardPattern -> ctx
        }
        val checkedNextExpression = if (nextExpr == null) {
            constraintAwareTypeChecker.checkAndInfer(
                expectedType = expectedType,
                actualType = Type.unit,
                errorRange = range
            )
            null
        } else {
            nextExpr.toChecked(ctx = newContext, expectedType = expectedType)
        }
        return Val(
            range = range,
            type = checkedNextExpression?.type ?: Type.unit,
            pattern = pattern,
            typeAnnotation = checkedAssignedExprType,
            assignedExpression = checkedAssignedExpr,
            nextExpression = checkedNextExpression
        )
    }
}
