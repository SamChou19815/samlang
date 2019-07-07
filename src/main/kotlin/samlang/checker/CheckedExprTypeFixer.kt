package samlang.checker

import samlang.ast.*
import samlang.ast.BinaryOperator.*
import samlang.ast.CheckedExprVisitor
import samlang.ast.Expression.*
import samlang.ast.Expression.Literal
import samlang.ast.Type.*
import samlang.errors.InsufficientTypeInferenceContextError
import samlang.errors.UnexpectedTypeError

internal object CheckedExprTypeFixer {

    // TODO produce better error messages

    fun fixType(
        expression: Expression,
        expectedType: Type,
        manager: UndecidedTypeManager,
        ctx: TypeCheckingContext,
        errorRange: Range
    ): Expression = expression.accept(
        visitor = TypeFixerVisitor(
            manager = manager,
            ctx = ctx,
            detectorVisitor = UnresolvedTypeDetectorVisitor(range = errorRange),
            errorRange = errorRange
        ),
        context = expectedType
    )

    private class UnresolvedTypeDetectorVisitor(private val range: Range) :
        TypeVisitor<Unit, Unit> {

        override fun visit(type: PrimitiveType, context: Unit) {}

        private fun Type.check(): Unit = accept(visitor = this@UnresolvedTypeDetectorVisitor, context = Unit)

        override fun visit(type: IdentifierType, context: Unit) {
            type.typeArguments?.forEach { it.check() }
        }

        override fun visit(type: TupleType, context: Unit): Unit =
            type.mappings.forEach { it.check() }

        override fun visit(type: FunctionType, context: Unit) {
            type.argumentTypes.forEach { it.check() }
            type.returnType.check()
        }

        override fun visit(type: UndecidedType, context: Unit): Unit =
            throw InsufficientTypeInferenceContextError(range = range)

    }

    private class TypeFixerVisitor(
        private val manager: UndecidedTypeManager,
        private val ctx: TypeCheckingContext,
        private val detectorVisitor: UnresolvedTypeDetectorVisitor,
        private val errorRange: Range
    ) : CheckedExprVisitor<Type, Expression> {

        private fun Expression.tryFixType(expectedType: Type): Expression =
            accept(visitor = this@TypeFixerVisitor, context = expectedType)

        private fun Expression.tryFixType(): Expression =
            accept(visitor = this@TypeFixerVisitor, context = type)

        private fun Type.fixSelf(expectedType: Type?): Type {
            val fullyResolvedType = manager.resolveType(unresolvedType = this)
            fullyResolvedType.accept(visitor = detectorVisitor, context = Unit)
            if (expectedType == null) {
                return fullyResolvedType
            }
            if (fullyResolvedType != expectedType) {
                throw UnexpectedTypeError(
                    expected = expectedType,
                    actual = fullyResolvedType,
                    range = errorRange
                )
            }
            return expectedType
        }

        private fun <T1, T2> List<T1>.checkedZip(other: List<T2>): List<Pair<T1, T2>> {
            if (size != other.size) {
                blameTypeChecker()
            }
            return zip(other = other)
        }

        private fun blameTypeChecker(): Nothing = error(message = "Slack type checker!")

        override fun visit(expression: Literal, context: Type): Expression =
            expression.copy(type = expression.type.fixSelf(expectedType = context))

        override fun visit(expression: This, context: Type): Expression =
            expression.copy(type = expression.type.fixSelf(expectedType = context))

        override fun visit(expression: Variable, context: Type): Expression =
            expression.copy(type = expression.type.fixSelf(expectedType = context))

        override fun visit(expression: ModuleMember, context: Type): Expression =
            expression.copy(type = expression.type.fixSelf(expectedType = context))

        override fun visit(expression: TupleConstructor, context: Type): Expression {
            val newType = expression.type.fixSelf(expectedType = context) as TupleType
            return expression.copy(
                type = newType,
                expressionList = expression.expressionList.zip(newType.mappings).map { (expression, type) ->
                    expression.tryFixType(expectedType = type)
                }
            )
        }

        override fun visit(expression: ObjectConstructor, context: Type): Expression {
            val newType = expression.type.fixSelf(expectedType = context) as IdentifierType
            val (_, params, mapping) = ctx.getCurrentModuleObjectTypeDef(errorRange = errorRange)
            val betterMapping = if (params != null && newType.typeArguments != null) {
                val replacementMap = params.checkedZip(other = newType.typeArguments).toMap()
                mapping.mapValues { (_, v) ->
                    ModuleTypeDefinitionResolver.applyGenericTypeParams(type = v, context = replacementMap)
                }
            } else mapping
            val newSpreadExpr = expression.spreadExpression?.tryFixType(expectedType = context)
            val newDeclarations = expression.fieldDeclarations.map { dec ->
                val expTypeForDec = betterMapping[dec.name] ?: blameTypeChecker()
                val betterType = dec.type.fixSelf(expectedType = expTypeForDec)
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
            val newType = expression.type.fixSelf(expectedType = context) as IdentifierType
            val (_, params, mapping) = ctx.getCurrentModuleVariantTypeDef(errorRange = errorRange)
            var dataType = mapping[expression.tag] ?: blameTypeChecker()
            if (params != null && newType.typeArguments != null) {
                dataType = ModuleTypeDefinitionResolver.applyGenericTypeParams(
                    type = dataType, context = params.checkedZip(other = newType.typeArguments).toMap()
                )
            }
            return expression.copy(
                type = newType,
                data = expression.data.tryFixType(expectedType = dataType)
            )
        }

        override fun visit(expression: FieldAccess, context: Type): Expression = expression.copy(
            type = expression.type.fixSelf(expectedType = context),
            expression = expression.expression.tryFixType(
                expectedType = expression.expression.type.fixSelf(expectedType = null)
            )
        )

        override fun visit(expression: MethodAccess, context: Type): Expression = expression.copy(
            type = expression.type.fixSelf(expectedType = context) as FunctionType,
            expression = expression.expression.tryFixType(
                expectedType = expression.expression.type.fixSelf(expectedType = null)
            ),
            methodName = expression.methodName
        )

        override fun visit(expression: Unary, context: Type): Expression = expression.copy(
            type = expression.type.fixSelf(expectedType = context),
            operator = expression.operator,
            expression = when (expression.operator) {
                UnaryOperator.NEG -> expression.expression.tryFixType()
                UnaryOperator.NOT -> expression.expression.tryFixType()
            }
        )

        override fun visit(expression: Panic, context: Type): Expression = expression.copy(
            type = expression.type.fixSelf(expectedType = context),
            expression = expression.expression.tryFixType()
        )

        override fun visit(expression: FunctionApplication, context: Type): Expression {
            val funExprType = expression.functionExpression.type.fixSelf(expectedType = null) as FunctionType
            if (context != funExprType.returnType) {
                throw UnexpectedTypeError(
                    expected = context,
                    actual = funExprType.returnType,
                    range = errorRange
                )
            }
            return expression.copy(
                type = expression.type.fixSelf(expectedType = context),
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
                    val t1 = expression.e1.type.fixSelf(expectedType = null)
                    val t2 = expression.e1.type.fixSelf(expectedType = null)
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
            return expression.copy(type = expression.type.fixSelf(expectedType = context), e1 = newE1, e2 = newE2)
        }

        override fun visit(expression: IfElse, context: Type): Expression = expression.copy(
            type = expression.type.fixSelf(expectedType = context),
            boolExpression = expression.boolExpression.tryFixType(),
            e1 = expression.e1.tryFixType(expectedType = context),
            e2 = expression.e2.tryFixType(expectedType = context)
        )

        override fun visit(expression: Match, context: Type): Expression {
            val matchedExprType = expression.matchedExpression.type.fixSelf(expectedType = null) as IdentifierType
            return expression.copy(
                type = expression.type.fixSelf(expectedType = context),
                matchedExpression = expression.matchedExpression.tryFixType(expectedType = matchedExprType),
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
            val newType = expression.type.fixSelf(expectedType = context) as FunctionType
            return expression.copy(
                type = newType,
                arguments = expression.arguments.checkedZip(other = newType.argumentTypes).map { (vAndOriginalT, t) ->
                    val (v, originalT) = vAndOriginalT
                    v to originalT.fixSelf(expectedType = t)
                },
                body = expression.body.tryFixType(expectedType = newType.returnType)
            )
        }

        override fun visit(expression: Val, context: Type): Expression {
            if (expression.nextExpression == null && context != Type.unit) {
                throw UnexpectedTypeError(expected = context, actual = Type.unit, range = errorRange)
            }
            return expression.copy(
                type = expression.type.fixSelf(expectedType = context),
                assignedExpression = expression.assignedExpression.run {
                    tryFixType(expectedType = type.fixSelf(expectedType = null))
                },
                nextExpression = expression.nextExpression?.tryFixType(expectedType = context)
            )
        }

    }

}
