package samlang.checker

import samlang.ast.common.BinaryOperator.AND
import samlang.ast.common.BinaryOperator.CONCAT
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
import samlang.ast.common.BuiltInFunctionName
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
import samlang.ast.lang.Expression.StatementBlockExpression
import samlang.ast.lang.Expression.This
import samlang.ast.lang.Expression.TupleConstructor
import samlang.ast.lang.Expression.Unary
import samlang.ast.lang.Expression.Variable
import samlang.ast.lang.Expression.VariantConstructor
import samlang.ast.lang.ExpressionVisitor
import samlang.errors.CompileTimeError
import samlang.errors.DuplicateFieldDeclarationError
import samlang.errors.IllegalThisError
import samlang.errors.InconsistentFieldsInObjectError
import samlang.errors.InsufficientTypeInferenceContextError
import samlang.errors.UnexpectedTypeKindError
import samlang.errors.UnresolvedNameError
import samlang.errors.UnsupportedClassTypeDefinitionError
import samlang.util.Either

internal fun typeCheckExpression(
    expression: Expression,
    errorCollector: ErrorCollector,
    accessibleGlobalTypingContext: AccessibleGlobalTypingContext,
    localTypingContext: LocalTypingContext,
    resolution: TypeResolution,
    expectedType: Type
): Expression {
    val visitor = ExpressionTypeCheckerVisitor(
        accessibleGlobalTypingContext = accessibleGlobalTypingContext,
        localTypingContext = localTypingContext,
        resolution = resolution,
        errorCollector = errorCollector
    )
    val checkedExpression = expression.accept(visitor = visitor, context = expectedType)
    if (errorCollector.collectedErrors.isNotEmpty()) {
        return checkedExpression
    }
    return fixExpressionType(expression = checkedExpression, expectedType = expectedType, resolution = resolution)
}

private class ExpressionTypeCheckerVisitor(
    private val accessibleGlobalTypingContext: AccessibleGlobalTypingContext,
    private val localTypingContext: LocalTypingContext,
    private val resolution: TypeResolution,
    val errorCollector: ErrorCollector
) : ExpressionVisitor<Type, Expression>, ExpressionTypeCheckerWithContext {

    private val constraintAwareTypeChecker: ConstraintAwareTypeChecker =
        ConstraintAwareTypeChecker(resolution = resolution, errorCollector = errorCollector)
    private val statementTypeChecker: StatementTypeChecker =
        StatementTypeChecker(
            accessibleGlobalTypingContext =
            accessibleGlobalTypingContext,
            errorCollector = errorCollector,
            expressionTypeChecker = this
        )

    private fun Expression.toChecked(expectedType: Type = this.type): Expression =
        this.accept(visitor = this@ExpressionTypeCheckerVisitor, context = expectedType)

    override fun typeCheck(expression: Expression, expectedType: Type): Expression =
        expression.toChecked(expectedType = expectedType)

    private fun Expression.errorWith(expectedType: Type, error: CompileTimeError): Expression {
        errorCollector.add(compileTimeError = error)
        return TypeReplacer.replaceWithExpectedType(expression = this, expectedType = expectedType)
    }

    override fun visit(expression: Literal, context: Type): Expression {
        constraintAwareTypeChecker.checkAndInfer(
            expectedType = context, actualType = expression.type, errorRange = expression.range
        )
        // Literals are already well typed if it passed the previous check.
        return expression
    }

    override fun visit(expression: This, context: Type): Expression {
        val type = localTypingContext.getLocalValueType(name = "this") ?: return expression.errorWith(
            expectedType = context,
            error = IllegalThisError(range = expression.range)
        )
        // don't need the return value because the type must be exact
        constraintAwareTypeChecker.checkAndInfer(
            expectedType = context, actualType = type, errorRange = expression.range
        )
        return expression.copy(type = type)
    }

    override fun visit(expression: Variable, context: Type): Expression {
        val (range, _, name) = expression
        val locallyInferredType = localTypingContext.getLocalValueType(name = name) ?: return expression.errorWith(
            expectedType = context,
            error = UnresolvedNameError(unresolvedName = name, range = range)
        )
        val inferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = context, actualType = locallyInferredType, errorRange = range
        )
        return expression.copy(type = inferredType)
    }

    override fun visit(expression: ClassMember, context: Type): Expression {
        val (range, _, _, className, _, member) = expression
        val (locallyInferredType, undecidedTypeArguments) = accessibleGlobalTypingContext
            .getClassFunctionType(module = className, member = member)
            ?: return expression.errorWith(
                expectedType = context,
                error = UnresolvedNameError(unresolvedName = "$className.$member", range = range)
            )
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = context, actualType = locallyInferredType, errorRange = range
        )
        return expression.copy(type = constraintInferredType, typeArguments = undecidedTypeArguments)
    }

    override fun visit(expression: TupleConstructor, context: Type): Expression {
        val (range, impreciseTupleType, expressionList) = expression
        val checkedExpressionList = expressionList.map { it.toChecked() }
        val locallyInferredType = impreciseTupleType.copy(mappings = checkedExpressionList.map { it.type })
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = context, actualType = locallyInferredType, errorRange = range
        )
        return if (constraintInferredType is TupleType) {
            expression.copy(
                type = constraintInferredType,
                expressionList = checkedExpressionList
            )
        } else {
            expression.errorWith(
                expectedType = context,
                error = UnexpectedTypeKindError(
                    expectedTypeKind = "tuple",
                    actualType = constraintInferredType,
                    range = range
                )
            )
        }
    }

    private fun typeCheckFieldDeclarations(
        fieldDeclarations: List<FieldConstructor>
    ): Either<Pair<Map<String, Type>, List<FieldConstructor>>, DuplicateFieldDeclarationError> {
        val declaredFieldTypes = mutableMapOf<String, Type>()
        val checkedDeclarations = mutableListOf<FieldConstructor>()
        for (fieldDeclaration in fieldDeclarations) {
            when (fieldDeclaration) {
                is FieldConstructor.Field -> {
                    val checkedExpression = fieldDeclaration.expression.toChecked()
                    val type = checkedExpression.type
                    val name = fieldDeclaration.name
                    if (declaredFieldTypes.put(key = name, value = type) != null) {
                        return Either.Right(
                            v = DuplicateFieldDeclarationError(fieldName = name, range = fieldDeclaration.range)
                        )
                    }
                    checkedDeclarations.add(fieldDeclaration.copy(type = type, expression = checkedExpression))
                }
                is FieldConstructor.FieldShorthand -> {
                    val name = fieldDeclaration.name
                    val range = fieldDeclaration.range
                    val checkedExpr = Variable(range = range, type = Type.undecided(), name = name).toChecked()
                    val type = checkedExpr.type
                    if (declaredFieldTypes.put(key = name, value = type) != null) {
                        return Either.Right(
                            v = DuplicateFieldDeclarationError(fieldName = name, range = fieldDeclaration.range)
                        )
                    }
                    checkedDeclarations.add(fieldDeclaration.copy(type = type))
                }
            }
        }
        return Either.Left(v = declaredFieldTypes to checkedDeclarations)
    }

    override fun visit(expression: ObjectConstructor, context: Type): Expression {
        val (range, _, fieldDeclarations) = expression
        val (_, _, typeParameters, fieldNames, typeMappings) = accessibleGlobalTypingContext
            .getCurrentClassTypeDefinition()
            ?.takeIf { it.type == OBJECT }
            ?: return expression.errorWith(
                expectedType = context,
                error = UnsupportedClassTypeDefinitionError(typeDefinitionType = OBJECT, range = range)
            )
        val (declaredFieldTypes, checkedDeclarations) =
            when (val result = typeCheckFieldDeclarations(fieldDeclarations = fieldDeclarations)) {
                is Either.Left -> result.v
                is Either.Right -> return expression.errorWith(expectedType = context, error = result.v)
            }
        val checkedMappings = hashMapOf<String, Type>()
        // used to quickly get the range where one declaration goes wrong
        val nameRangeMap = fieldDeclarations.asSequence().map { it.name to it.range }.toMap()
        val locallyInferredType = kotlin.run {
            // In this case, all keys must perfectly match because we have no fall back
            if (typeMappings.keys != declaredFieldTypes.keys) {
                return expression.errorWith(
                    expectedType = context,
                    error = InconsistentFieldsInObjectError(
                        expectedFields = typeMappings.keys,
                        actualFields = declaredFieldTypes.keys,
                        range = expression.range
                    )
                )
            }
            val (genericsResolvedTypeMappings, autoGeneratedUndecidedTypes) = TypeUndecider.undecideTypeParameters(
                typeMappings = typeMappings,
                typeParameters = typeParameters
            )
            for ((k, actualType) in declaredFieldTypes) {
                val (reqType, _) = genericsResolvedTypeMappings[k] ?: error("Name not found!")
                val nameRange = nameRangeMap[k] ?: error("Name not found!")
                checkedMappings[k] = constraintAwareTypeChecker.checkAndInfer(
                    expectedType = reqType, actualType = actualType, errorRange = nameRange
                )
            }
            val constraintInferredTypeArguments = autoGeneratedUndecidedTypes.map { undecidedType ->
                resolution.getPartiallyResolvedType(undecidedType = undecidedType)
            }
            IdentifierType(
                identifier = accessibleGlobalTypingContext.currentClass,
                typeArguments = constraintInferredTypeArguments
            )
        }
        val enhancedFieldDeclarations = checkedDeclarations.map { dec ->
            val betterType = checkedMappings[dec.name] ?: error(message = "Impossible Case")
            dec.copyWithNewType(type = betterType)
        }
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = context, actualType = locallyInferredType, errorRange = range
        )
        return if (constraintInferredType is IdentifierType) {
            val fieldOrderMap = fieldNames.asSequence().mapIndexed { index, name -> name to index }.toMap()
            val sortedFields = enhancedFieldDeclarations.sortedBy {
                fieldOrderMap[it.name] ?: error(message = "Missing field!")
            }
            ObjectConstructor(range = range, type = constraintInferredType, fieldDeclarations = sortedFields)
        } else {
            expression.errorWith(
                expectedType = context,
                error = UnexpectedTypeKindError(
                    expectedTypeKind = "class",
                    actualType = constraintInferredType,
                    range = range
                )
            )
        }
    }

    override fun visit(expression: VariantConstructor, context: Type): Expression {
        val (range, _, tag, _, data) = expression
        val (_, _, typeParameters, variantNames, typeMappings) = accessibleGlobalTypingContext
            .getCurrentClassTypeDefinition()
            ?.takeIf { it.type == VARIANT }
            ?: return expression.errorWith(
                expectedType = context,
                error = UnsupportedClassTypeDefinitionError(typeDefinitionType = VARIANT, range = range)
            )
        val checkedData = data.toChecked()
        val (associatedDataType, _) = typeMappings[tag] ?: return expression.errorWith(
            expectedType = context,
            error = UnresolvedNameError(unresolvedName = tag, range = range)
        )
        val (genericsResolvedAssociatedDataType, autoGeneratedUndecidedTypes) = TypeUndecider.undecideTypeParameters(
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
            identifier = accessibleGlobalTypingContext.currentClass, typeArguments = constraintInferredTypeArgs
        )
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = context, actualType = locallyInferredType, errorRange = range
        )
        val order = variantNames.indexOf(element = tag)
        if (order == -1) {
            error(message = "Bad tag!")
        }
        return expression.copy(type = constraintInferredType, tagOrder = order, data = checkedData)
    }

    override fun visit(expression: FieldAccess, context: Type): Expression {
        val (range, _, objectExpression, fieldName) = expression
        val tryTypeCheckMethodAccessResult = tryTypeCheckMethodAccess(
            expression = MethodAccess(
                range = range, type = expression.type, expression = objectExpression, methodName = fieldName
            )
        )
        if (tryTypeCheckMethodAccessResult is Either.Left) {
            val (checkedExpression, locallyInferredType) = tryTypeCheckMethodAccessResult.v
            val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
                expectedType = context, actualType = locallyInferredType, errorRange = expression.range
            )
            return MethodAccess(
                range = range, type = constraintInferredType, expression = checkedExpression, methodName = fieldName
            )
        }
        val checkedObjectExpression = objectExpression.toChecked()
        val betterExpression = expression.copy(expression = checkedObjectExpression)
        val checkedObjectExpressionType = checkedObjectExpression.type
        if (checkedObjectExpressionType is UndecidedType) {
            return checkedObjectExpression.errorWith(
                expectedType = context,
                error = InsufficientTypeInferenceContextError(range = checkedObjectExpression.range)
            )
        }
        if (checkedObjectExpressionType !is IdentifierType) {
            return betterExpression.errorWith(
                expectedType = context,
                error = UnexpectedTypeKindError(
                    expectedTypeKind = "identifier",
                    actualType = checkedObjectExpressionType,
                    range = checkedObjectExpression.range
                )
            )
        }
        val fieldMappingsOrError = ClassTypeDefinitionResolver.getTypeDefinition(
            identifierType = checkedObjectExpressionType,
            context = accessibleGlobalTypingContext,
            typeDefinitionType = OBJECT,
            errorRange = objectExpression.range
        )
        val (fieldNames, fieldMappings) = when (fieldMappingsOrError) {
            is Either.Left -> fieldMappingsOrError.v
            is Either.Right -> return betterExpression.errorWith(
                expectedType = context,
                error = fieldMappingsOrError.v
            )
        }
        val (locallyInferredFieldType, isPublic) = fieldMappings[fieldName] ?: return betterExpression.errorWith(
            expectedType = context,
            error = UnresolvedNameError(unresolvedName = fieldName, range = range)
        )
        if (checkedObjectExpressionType.identifier != accessibleGlobalTypingContext.currentClass && !isPublic) {
            betterExpression.errorWith(
                expectedType = context,
                error = UnresolvedNameError(unresolvedName = fieldName, range = range)
            )
        }
        val constraintInferredFieldType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = context, actualType = locallyInferredFieldType, errorRange = expression.range
        )
        val fieldOrder = fieldNames.indexOf(element = fieldName)
        if (fieldOrder == -1) {
            error(message = "Bad field!")
        }
        return expression.copy(
            type = constraintInferredFieldType,
            fieldOrder = fieldOrder,
            expression = checkedObjectExpression
        )
    }

    private fun tryTypeCheckMethodAccess(
        expression: MethodAccess
    ): Either<Pair<Expression, FunctionType>, CompileTimeError> {
        val (range, _, expressionToCallMethod, methodName) = expression
        val checkedExpression = expressionToCallMethod.toChecked()
        val checkedExpressionType = checkedExpression.type
        if (checkedExpressionType is UndecidedType) {
            return Either.Right(v = InsufficientTypeInferenceContextError(range = checkedExpression.range))
        }
        if (checkedExpressionType !is IdentifierType) {
            return Either.Right(
                v = UnexpectedTypeKindError(
                    expectedTypeKind = "identifier",
                    actualType = checkedExpressionType,
                    range = expressionToCallMethod.range
                )
            )
        }
        val (checkedExprTypeIdentifier, checkedExprTypeArguments) = checkedExpressionType
        val methodTypeOrError = accessibleGlobalTypingContext.getClassMethodType(
            module = checkedExprTypeIdentifier,
            typeArguments = checkedExprTypeArguments,
            methodName = methodName,
            errorRange = range
        )
        return when (methodTypeOrError) {
            is Either.Left -> Either.Left(v = checkedExpression to methodTypeOrError.v)
            is Either.Right -> Either.Right(v = methodTypeOrError.v)
        }
    }

    override fun visit(expression: MethodAccess, context: Type): Expression {
        val result = tryTypeCheckMethodAccess(expression = expression)
        val (checkedExpression, locallyInferredType) = when (result) {
            is Either.Left -> result.v
            is Either.Right -> return expression.errorWith(expectedType = context, error = result.v)
        }
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = context, actualType = locallyInferredType, errorRange = expression.range
        )
        return expression.copy(type = constraintInferredType, expression = checkedExpression)
    }

    override fun visit(expression: Unary, context: Type): Expression {
        val (range, type, _, subExpression) = expression
        constraintAwareTypeChecker.checkAndInfer(expectedType = context, actualType = type, errorRange = range)
        val checkedSubExpression = subExpression.toChecked(expectedType = type)
        return expression.copy(expression = checkedSubExpression)
    }

    override fun visit(expression: Panic, context: Type): Expression {
        val (range, type, subExpression) = expression
        val checkedSubExpression = subExpression.toChecked(expectedType = Type.string)
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = context, actualType = type, errorRange = range
        )
        return expression.copy(type = constraintInferredType, expression = checkedSubExpression)
    }

    override fun visit(expression: Expression.BuiltInFunctionCall, context: Type): Expression {
        val (range, type, functionName, argumentExpression) = expression
        val expectedArgumentType = when (functionName) {
            BuiltInFunctionName.STRING_TO_INT -> Type.string
            BuiltInFunctionName.INT_TO_STRING -> Type.int
            BuiltInFunctionName.PRINTLN -> Type.string
        }
        val checkedArgument = argumentExpression.toChecked(expectedType = expectedArgumentType)
        constraintAwareTypeChecker.checkAndInfer(expectedType = context, actualType = type, errorRange = range)
        return expression.copy(argumentExpression = checkedArgument)
    }

    override fun visit(expression: FunctionApplication, context: Type): Expression {
        val (range, _, functionExpression, arguments) = expression
        val checkedArguments = arguments.map { it.toChecked() }
        val expectedTypeForFunction = FunctionType(
            argumentTypes = checkedArguments.map { it.type },
            returnType = context
        )
        val checkedFunctionExpression = functionExpression.toChecked(expectedType = expectedTypeForFunction)
        val (locallyInferredArgTypes, locallyInferredReturnType) = checkedFunctionExpression.type as? FunctionType
            ?: return expression.errorWith(
                expectedType = context,
                error = UnexpectedTypeKindError(
                    expectedTypeKind = "function",
                    actualType = checkedFunctionExpression.type,
                    range = functionExpression.range
                )
            )
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = context, actualType = locallyInferredReturnType, errorRange = range
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

    override fun visit(expression: Binary, context: Type): Expression {
        val (range, _, e1, op, e2) = expression
        val checkedExpression = when (op) {
            MUL, DIV, MOD, PLUS, MINUS -> expression.copy(
                e1 = e1.toChecked(expectedType = Type.int),
                e2 = e2.toChecked(expectedType = Type.int)
            )
            LT, LE, GT, GE -> expression.copy(
                e1 = e1.toChecked(expectedType = Type.int),
                e2 = e2.toChecked(expectedType = Type.int)
            )
            EQ, NE -> {
                val checkedE1 = e1.toChecked()
                val checkedE2 = e2.toChecked(expectedType = checkedE1.type)
                expression.copy(e1 = checkedE1, e2 = checkedE2)
            }
            AND, OR -> expression.copy(
                e1 = e1.toChecked(expectedType = Type.bool),
                e2 = e2.toChecked(expectedType = Type.bool)
            )
            CONCAT -> expression.copy(
                e1 = e1.toChecked(expectedType = Type.string),
                e2 = e2.toChecked(expectedType = Type.string)
            )
        }
        constraintAwareTypeChecker.checkAndInfer(
            expectedType = context, actualType = checkedExpression.type, errorRange = range
        )
        return checkedExpression
    }

    override fun visit(expression: IfElse, context: Type): Expression {
        val (_, _, boolExpression, e1, e2) = expression
        val checkedBoolExpression = boolExpression.toChecked(expectedType = Type.bool)
        val checkedE1 = e1.toChecked(expectedType = context)
        val checkedE2 = e2.toChecked(expectedType = context)
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = context,
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

    override fun visit(expression: Match, context: Type): Expression {
        val (range, _, matchedExpression, matchingList) = expression
        val checkedMatchedExpression = matchedExpression.toChecked()
        val (variantNames, variantMappings) = when (val checkedMatchedExpressionType = checkedMatchedExpression.type) {
            is IdentifierType -> {
                val variantMappingsOrError = ClassTypeDefinitionResolver.getTypeDefinition(
                    identifierType = checkedMatchedExpressionType,
                    context = accessibleGlobalTypingContext,
                    typeDefinitionType = VARIANT,
                    errorRange = matchedExpression.range
                )
                when (variantMappingsOrError) {
                    is Either.Left -> variantMappingsOrError.v
                    is Either.Right -> return expression.errorWith(
                        expectedType = context, error = variantMappingsOrError.v
                    )
                }
            }
            is UndecidedType -> return expression.errorWith(
                expectedType = context,
                error = InsufficientTypeInferenceContextError(checkedMatchedExpression.range)
            )
            else -> return expression.errorWith(
                expectedType = context,
                error = UnexpectedTypeKindError(
                    expectedTypeKind = "identifier",
                    actualType = checkedMatchedExpressionType,
                    range = matchedExpression.range
                )
            )
        }
        val unusedMappings = variantMappings.toMutableMap()
        val checkedMatchingList = matchingList.map { (range, tag, _, dataVariable, correspondingExpr) ->
            val (mappingDataType, _) = unusedMappings[tag]
                ?: return expression.errorWith(
                    expectedType = context,
                    error = UnresolvedNameError(unresolvedName = tag, range = range)
                )
            unusedMappings.remove(key = tag)
            val checkedExpression = if (dataVariable == null) {
                localTypingContext.withNestedScope {
                    correspondingExpr.toChecked(expectedType = context)
                }
            } else {
                localTypingContext.addLocalValueType(name = dataVariable, type = mappingDataType) {
                    errorCollector.reportCollisionError(name = dataVariable, range = range)
                }
                val checked = correspondingExpr.toChecked(expectedType = context)
                localTypingContext.removeLocalValue(name = dataVariable)
                checked
            }
            val tagOrder = variantNames.indexOf(element = tag)
            if (tagOrder == -1) {
                error(message = "Bad field!")
            }
            Match.VariantPatternToExpr(
                range = range,
                tag = tag,
                tagOrder = tagOrder,
                dataVariable = dataVariable,
                expression = checkedExpression
            )
        }
        val finalType =
            checkedMatchingList.asSequence().map { it.expression.type }.fold(initial = context) { exp, act ->
                constraintAwareTypeChecker.checkAndInfer(expectedType = exp, actualType = act, errorRange = range)
            }
        return Match(
            range = range,
            type = finalType,
            matchedExpression = checkedMatchedExpression,
            matchingList = checkedMatchingList
        )
    }

    override fun visit(expression: Lambda, context: Type): Expression {
        val (range, functionType, arguments, _, body) = expression
        // check duplicated name among themselves first
        val names = hashSetOf<String>()
        for ((name, _) in arguments) {
            if (!names.add(name)) {
                errorCollector.reportCollisionError(name = name, range = range)
                return TypeReplacer.replaceWithExpectedType(expression = expression, expectedType = context)
            }
        }
        // setting up types and update context
        val (checkedArgumentsAndBody, captured) = localTypingContext.withNestedScopeReturnCaptured {
            val checkedArguments = arguments.map { (argumentName, argumentType) ->
                val argumentTypeIsValid = TypeValidator.validateType(
                    type = argumentType,
                    identifierTypeValidator = accessibleGlobalTypingContext,
                    errorCollector = errorCollector,
                    errorRange = range
                )
                if (!argumentTypeIsValid) {
                    return@withNestedScopeReturnCaptured null
                }
                localTypingContext.addLocalValueType(name = argumentName, type = argumentType) {
                    errorCollector.reportCollisionError(name = argumentName, range = range)
                }
                argumentName to argumentType
            }
            val checkedBody = body.toChecked(expectedType = functionType.returnType)
            checkedArguments to checkedBody
        }
        val (checkedArguments, checkedBody) = checkedArgumentsAndBody
            ?: return TypeReplacer.replaceWithExpectedType(expression = expression, expectedType = context)
        // merge a somewhat good locally inferred type
        val locallyInferredType = functionType.copy(
            argumentTypes = checkedArguments.map { it.second },
            returnType = checkedBody.type
        )
        val constraintInferredType = constraintAwareTypeChecker.checkAndInfer(
            expectedType = context, actualType = locallyInferredType, errorRange = range
        )
        return if (constraintInferredType is FunctionType) {
            Lambda(
                range = range,
                type = constraintInferredType,
                parameters = checkedArguments,
                captured = captured,
                body = checkedBody
            )
        } else {
            expression.errorWith(
                expectedType = context,
                error = UnexpectedTypeKindError(
                    expectedTypeKind = "function",
                    actualType = constraintInferredType,
                    range = range
                )
            )
        }
    }

    override fun visit(expression: StatementBlockExpression, context: Type): Expression {
        val checkedStatementBlock = statementTypeChecker.typeCheck(
            statementBlock = expression.block,
            localContext = localTypingContext,
            expectedType = context
        )
        return expression.copy(
            type = checkedStatementBlock.expression?.type ?: Type.unit,
            block = checkedStatementBlock
        )
    }
}
