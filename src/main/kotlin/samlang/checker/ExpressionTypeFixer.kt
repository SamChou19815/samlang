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
import samlang.ast.lang.ExpressionVisitor
import samlang.ast.lang.ClassDefinition.TypeDefinitionType.OBJECT
import samlang.ast.lang.ClassDefinition.TypeDefinitionType.VARIANT
import samlang.ast.lang.Expression
import samlang.ast.lang.Expression.Binary
import samlang.ast.lang.Expression.FieldAccess
import samlang.ast.lang.Expression.FunctionApplication
import samlang.ast.lang.Expression.IfElse
import samlang.ast.lang.Expression.Lambda
import samlang.ast.lang.Expression.Literal
import samlang.ast.lang.Expression.Match
import samlang.ast.lang.Expression.MethodAccess
import samlang.ast.lang.Expression.ModuleMember
import samlang.ast.lang.Expression.ObjectConstructor
import samlang.ast.lang.Expression.Panic
import samlang.ast.lang.Expression.This
import samlang.ast.lang.Expression.TupleConstructor
import samlang.ast.lang.Expression.Unary
import samlang.ast.lang.Expression.Val
import samlang.ast.lang.Expression.Variable
import samlang.ast.lang.Expression.VariantConstructor
import samlang.ast.common.Range
import samlang.ast.lang.Type
import samlang.ast.lang.Type.FunctionType
import samlang.ast.lang.Type.IdentifierType
import samlang.ast.lang.Type.TupleType
import samlang.ast.lang.UnaryOperator
import samlang.errors.InsufficientTypeInferenceContextError
import samlang.errors.UnexpectedTypeError
import samlang.errors.UnsupportedClassTypeDefinitionError

internal fun Expression.fixType(
    expectedType: Type,
    resolution: TypeResolution,
    errorCollector: ErrorCollector,
    typeCheckingContext: TypeCheckingContext
): Expression {
    val visitor = TypeFixerVisitor(
        resolution = resolution,
        errorCollector = errorCollector,
        ctx = typeCheckingContext,
        errorRange = this.range
    )
    return this.collectPotentialError(errorCollector = errorCollector) {
        this.accept(visitor = visitor, context = expectedType)
    }
}

private class TypeFixerVisitor(
    private val resolution: TypeResolution,
    private val errorCollector: ErrorCollector,
    private val ctx: TypeCheckingContext,
    private val errorRange: Range
) : ExpressionVisitor<Type, Expression> {

    private fun Expression.tryFixType(expectedType: Type = this.type): Expression =
        this.collectPotentialError(errorCollector = errorCollector) {
            this.accept(visitor = this@TypeFixerVisitor, context = expectedType)
        }

    private fun Type.fixSelf(expectedType: Type?, errorRange: Range): Type {
        val fullyResolvedType = resolution.resolveType(unresolvedType = this)
        if (collectUndecidedTypeIndices(type = fullyResolvedType).isNotEmpty()) {
            throw InsufficientTypeInferenceContextError(range = errorRange)
        }
        if (expectedType == null) {
            return fullyResolvedType
        }
        if (fullyResolvedType != expectedType) {
            throw UnexpectedTypeError(expected = expectedType, actual = fullyResolvedType, range = errorRange)
        }
        return expectedType
    }

    private fun Expression.getFixedSelfType(expectedType: Type?): Type =
        type.fixSelf(expectedType = expectedType, errorRange = range)

    private fun <T1, T2> List<T1>.checkedZip(other: List<T2>): List<Pair<T1, T2>> {
        if (size != other.size) {
            blameTypeChecker()
        }
        return zip(other = other)
    }

    private fun blameTypeChecker(): Nothing = error(message = "Slack type checker!")

    override fun visit(expression: Literal, context: Type): Expression =
        expression.copy(type = expression.getFixedSelfType(expectedType = context))

    override fun visit(expression: This, context: Type): Expression =
        expression.copy(type = expression.getFixedSelfType(expectedType = context))

    override fun visit(expression: Variable, context: Type): Expression =
        expression.copy(type = expression.getFixedSelfType(expectedType = context))

    override fun visit(expression: ModuleMember, context: Type): Expression =
        expression.copy(type = expression.getFixedSelfType(expectedType = context))

    override fun visit(expression: TupleConstructor, context: Type): Expression {
        val newType = expression.type.fixSelf(expectedType = context, errorRange = expression.range) as TupleType
        return expression.copy(
            type = newType,
            expressionList = expression.expressionList.zip(newType.mappings).map { (expression, type) ->
                expression.tryFixType(expectedType = type)
            }
        )
    }

    override fun visit(expression: ObjectConstructor, context: Type): Expression {
        val newType =
            expression.type.fixSelf(expectedType = context, errorRange = expression.range) as IdentifierType
        val (_, _, typeParameters, mapping) = ctx.getCurrentModuleTypeDefinition()
            ?.takeIf { it.type == OBJECT }
            ?: throw UnsupportedClassTypeDefinitionError(typeDefinitionType = OBJECT, range = errorRange)
        val newTypeArguments = newType.typeArguments
        val betterMapping = if (typeParameters != null && newTypeArguments != null) {
            val replacementMap = typeParameters.checkedZip(other = newTypeArguments).toMap()
            mapping.mapValues { (_, v) ->
                ClassTypeDefinitionResolver.applyGenericTypeParameters(type = v, context = replacementMap)
            }
        } else mapping
        val newSpreadExpr = expression.spreadExpression?.tryFixType(expectedType = context)
        val newDeclarations = expression.fieldDeclarations.map { dec ->
            val expTypeForDec = betterMapping[dec.name] ?: blameTypeChecker()
            val betterType = dec.type.fixSelf(expectedType = expTypeForDec, errorRange = dec.range)
            when (dec) {
                is ObjectConstructor.FieldConstructor.Field -> dec.copy(
                    type = betterType,
                    expression = dec.expression.tryFixType(expectedType = betterType)
                )
                is ObjectConstructor.FieldConstructor.FieldShorthand -> dec.copy(type = betterType)
            }
        }
        return expression.copy(
            type = newType,
            spreadExpression = newSpreadExpr,
            fieldDeclarations = newDeclarations
        )
    }

    override fun visit(expression: VariantConstructor, context: Type): Expression {
        val newType = expression.getFixedSelfType(expectedType = context) as IdentifierType
        val (_, _, typeParameters, mapping) = ctx.getCurrentModuleTypeDefinition()
            ?.takeIf { it.type == VARIANT }
            ?: throw UnsupportedClassTypeDefinitionError(typeDefinitionType = VARIANT, range = errorRange)
        var dataType = mapping[expression.tag] ?: blameTypeChecker()
        val newTypeArguments = newType.typeArguments
        if (typeParameters != null && newTypeArguments != null) {
            dataType = ClassTypeDefinitionResolver.applyGenericTypeParameters(
                type = dataType, context = typeParameters.checkedZip(other = newTypeArguments).toMap()
            )
        }
        return expression.copy(
            type = newType,
            data = expression.data.tryFixType(expectedType = dataType)
        )
    }

    override fun visit(expression: FieldAccess, context: Type): Expression = expression.copy(
        type = expression.getFixedSelfType(expectedType = context),
        expression = expression.expression.tryFixType(
            expectedType = expression.expression.getFixedSelfType(expectedType = null)
        )
    )

    override fun visit(expression: MethodAccess, context: Type): Expression = expression.copy(
        type = expression.getFixedSelfType(expectedType = context) as FunctionType,
        expression = expression.expression.tryFixType(
            expectedType = expression.expression.getFixedSelfType(expectedType = null)
        ),
        methodName = expression.methodName
    )

    override fun visit(expression: Unary, context: Type): Expression = expression.copy(
        type = expression.getFixedSelfType(expectedType = context),
        operator = expression.operator,
        expression = when (expression.operator) {
            UnaryOperator.NEG -> expression.expression.tryFixType()
            UnaryOperator.NOT -> expression.expression.tryFixType()
        }
    )

    override fun visit(expression: Panic, context: Type): Expression = expression.copy(
        type = expression.getFixedSelfType(expectedType = context),
        expression = expression.expression.tryFixType()
    )

    override fun visit(expression: FunctionApplication, context: Type): Expression {
        val funExprType = expression.functionExpression.getFixedSelfType(expectedType = null) as FunctionType
        if (context != funExprType.returnType) {
            throw UnexpectedTypeError(
                expected = context,
                actual = funExprType.returnType,
                range = errorRange
            )
        }
        return expression.copy(
            type = expression.getFixedSelfType(expectedType = context),
            functionExpression = expression.functionExpression.tryFixType(expectedType = funExprType),
            arguments = expression.arguments.checkedZip(other = funExprType.argumentTypes).map { (e, t) ->
                e.tryFixType(expectedType = t)
            }
        )
    }

    override fun visit(expression: Binary, context: Type): Expression {
        val (newE1, newE2) = when (expression.operator) {
            MUL, DIV, MOD, PLUS, MINUS, LT, LE, GT, GE, AND, OR -> {
                expression.e1.tryFixType() to expression.e2.tryFixType()
            }
            NE, EQ -> {
                val t1 = expression.e1.getFixedSelfType(expectedType = null)
                val t2 = expression.e1.getFixedSelfType(expectedType = null)
                if (t1 != t2) {
                    throw UnexpectedTypeError(
                        expected = t1,
                        actual = t2,
                        range = errorRange
                    )
                }
                val newE1 = expression.e1.tryFixType(expectedType = t1)
                val newE2 = expression.e2.tryFixType(expectedType = t1)
                newE1 to newE2
            }
        }
        return expression.copy(type = expression.getFixedSelfType(expectedType = context), e1 = newE1, e2 = newE2)
    }

    override fun visit(expression: IfElse, context: Type): Expression = expression.copy(
        type = expression.getFixedSelfType(expectedType = context),
        boolExpression = expression.boolExpression.tryFixType(),
        e1 = expression.e1.tryFixType(expectedType = context),
        e2 = expression.e2.tryFixType(expectedType = context)
    )

    override fun visit(expression: Match, context: Type): Expression {
        val matchedExpressionType =
            expression.matchedExpression.getFixedSelfType(expectedType = null) as IdentifierType
        return expression.copy(
            type = expression.getFixedSelfType(expectedType = context),
            matchedExpression = expression.matchedExpression.tryFixType(expectedType = matchedExpressionType),
            matchingList = expression.matchingList.map { (range, tag, dataVar, expression) ->
                Match.VariantPatternToExpr(
                    range = range,
                    tag = tag,
                    dataVariable = dataVar,
                    expression = expression.tryFixType(expectedType = context)
                )
            }
        )
    }

    override fun visit(expression: Lambda, context: Type): Expression {
        val newType = expression.getFixedSelfType(expectedType = context) as FunctionType
        return expression.copy(
            type = newType,
            parameters = expression.parameters.checkedZip(other = newType.argumentTypes).map { (vAndOriginalT, t) ->
                val (v, originalT) = vAndOriginalT
                v to originalT.fixSelf(expectedType = t, errorRange = expression.range)
            },
            body = expression.body.tryFixType(expectedType = newType.returnType)
        )
    }

    override fun visit(expression: Val, context: Type): Expression {
        if (expression.nextExpression == null && context != Type.unit) {
            throw UnexpectedTypeError(expected = context, actual = Type.unit, range = errorRange)
        }
        return expression.copy(
            type = expression.getFixedSelfType(expectedType = context),
            assignedExpression = expression.assignedExpression.run {
                tryFixType(expectedType = type.fixSelf(expectedType = null, errorRange = range))
            },
            nextExpression = expression.nextExpression?.tryFixType(expectedType = context)
        )
    }
}
