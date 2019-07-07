package samlang.checker

import samlang.ast.checked.CheckedExpr
import samlang.ast.checked.CheckedExpr.*
import samlang.ast.checked.CheckedExprVisitor
import samlang.ast.checked.CheckedTypeExpr
import samlang.ast.checked.CheckedTypeExpr.*
import samlang.ast.checked.CheckedTypeExprVisitor
import samlang.ast.common.BinaryOperator.*
import samlang.ast.common.UnaryOperator
import samlang.errors.InsufficientTypeInferenceContextError
import samlang.errors.UnexpectedTypeError
import samlang.ast.common.Range

internal object CheckedExprTypeFixer {

    // TODO produce better error messages

    fun fixType(
        expr: CheckedExpr,
        expectedType: CheckedTypeExpr,
        manager: UndecidedTypeManager,
        ctx: TypeCheckingContext,
        errorRange: Range
    ): CheckedExpr = expr.accept(
        visitor = TypeFixerVisitor(
            manager = manager,
            ctx = ctx,
            detectorVisitor = UnresolvedTypeDetectorVisitor(pos = errorRange),
            errorRange = errorRange
        ),
        context = expectedType
    )

    private class UnresolvedTypeDetectorVisitor(private val pos: Range) : CheckedTypeExprVisitor<Unit, Unit> {

        override fun visit(typeExpr: UnitType, context: Unit) {}
        override fun visit(typeExpr: IntType, context: Unit) {}
        override fun visit(typeExpr: StringType, context: Unit) {}
        override fun visit(typeExpr: BoolType, context: Unit) {}

        private fun CheckedTypeExpr.check(): Unit = accept(visitor = this@UnresolvedTypeDetectorVisitor, context = Unit)

        override fun visit(typeExpr: IdentifierType, context: Unit) {
            typeExpr.typeArgs?.forEach { it.check() }
        }

        override fun visit(typeExpr: TupleType, context: Unit): Unit = typeExpr.mappings.forEach { it.check() }

        override fun visit(typeExpr: FunctionType, context: Unit) {
            typeExpr.argumentTypes.forEach { it.check() }
            typeExpr.returnType.check()
        }

        override fun visit(typeExpr: UndecidedType, context: Unit): Unit =
            throw InsufficientTypeInferenceContextError(range = pos)

        override fun visit(typeExpr: FreeType, context: Unit): Unit =
            error(message = "The expression should not contain free type.")

    }

    private class TypeFixerVisitor(
        private val manager: UndecidedTypeManager,
        private val ctx: TypeCheckingContext,
        private val detectorVisitor: UnresolvedTypeDetectorVisitor,
        private val errorRange: Range
    ) : CheckedExprVisitor<CheckedTypeExpr, CheckedExpr> {

        private fun CheckedExpr.tryFixType(expectedType: CheckedTypeExpr): CheckedExpr =
            accept(visitor = this@TypeFixerVisitor, context = expectedType)

        private fun CheckedTypeExpr.fixSelf(expectedType: CheckedTypeExpr?): CheckedTypeExpr {
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

        override fun visit(expr: Literal, context: CheckedTypeExpr): CheckedExpr =
            expr.copy(type = expr.type.fixSelf(expectedType = context))

        override fun visit(expr: This, context: CheckedTypeExpr): CheckedExpr =
            expr.copy(type = expr.type.fixSelf(expectedType = context))

        override fun visit(expr: Variable, context: CheckedTypeExpr): CheckedExpr =
            expr.copy(type = expr.type.fixSelf(expectedType = context))

        override fun visit(expr: ModuleMember, context: CheckedTypeExpr): CheckedExpr =
            expr.copy(type = expr.type.fixSelf(expectedType = context))

        override fun visit(expr: TupleConstructor, context: CheckedTypeExpr): CheckedExpr {
            val newType = expr.type.fixSelf(expectedType = context) as TupleType
            return TupleConstructor(
                type = newType,
                exprList = expr.exprList.zip(newType.mappings).map { (e, t) -> e.tryFixType(expectedType = t) }
            )
        }

        override fun visit(expr: ObjectConstructor, context: CheckedTypeExpr): CheckedExpr {
            val newType = expr.type.fixSelf(expectedType = context) as IdentifierType
            val (params, mapping) = ctx.getCurrentModuleObjectTypeDef(errorRange = errorRange)
            val betterMapping = if (params != null && newType.typeArgs != null) {
                val replacementMap = params.checkedZip(other = newType.typeArgs).toMap()
                mapping.mapValues { (_, v) ->
                    ModuleTypeDefResolver.applyGenericTypeParams(type = v, context = replacementMap)
                }
            } else mapping
            val newSpreadExpr = expr.spreadExpr?.tryFixType(expectedType = context)
            val newDeclarations = expr.fieldDeclarations.map { dec ->
                val expTypeForDec = betterMapping[dec.name] ?: blameTypeChecker()
                val betterType = dec.type.fixSelf(expectedType = expTypeForDec)
                when (dec) {
                    is ObjectConstructor.FieldConstructor.Field -> dec.copy(
                        type = betterType,
                        expr = dec.expr.tryFixType(expectedType = betterType)
                    )
                    is ObjectConstructor.FieldConstructor.FieldShorthand -> dec.copy(type = betterType)
                }
            }
            return ObjectConstructor(
                type = newType,
                spreadExpr = newSpreadExpr,
                fieldDeclarations = newDeclarations
            )
        }

        override fun visit(expr: VariantConstructor, context: CheckedTypeExpr): CheckedExpr {
            val newType = expr.type.fixSelf(expectedType = context) as IdentifierType
            val (params, mapping) = ctx.getCurrentModuleVariantTypeDef(errorRange = errorRange)
            var dataType = mapping[expr.tag] ?: blameTypeChecker()
            if (params != null && newType.typeArgs != null) {
                dataType = ModuleTypeDefResolver.applyGenericTypeParams(
                    type = dataType, context = params.checkedZip(other = newType.typeArgs).toMap()
                )
            }
            return VariantConstructor(
                type = newType,
                tag = expr.tag,
                data = expr.data.tryFixType(expectedType = dataType)
            )
        }

        override fun visit(expr: FieldAccess, context: CheckedTypeExpr): CheckedExpr = FieldAccess(
            type = expr.type.fixSelf(expectedType = context),
            expr = expr.expr.tryFixType(expectedType = expr.expr.type.fixSelf(expectedType = null)),
            fieldName = expr.fieldName
        )

        override fun visit(expr: MethodAccess, context: CheckedTypeExpr): CheckedExpr = MethodAccess(
            type = expr.type.fixSelf(expectedType = context) as FunctionType,
            expr = expr.expr.tryFixType(expectedType = expr.expr.type.fixSelf(expectedType = null)),
            methodName = expr.methodName
        )

        override fun visit(expr: Unary, context: CheckedTypeExpr): CheckedExpr = Unary(
            type = expr.type.fixSelf(expectedType = context),
            operator = expr.operator,
            expr = when (expr.operator) {
                UnaryOperator.NEG -> expr.expr.tryFixType(expectedType = IntType)
                UnaryOperator.NOT -> expr.expr.tryFixType(expectedType = BoolType)
            }
        )

        override fun visit(expr: Panic, context: CheckedTypeExpr): CheckedExpr = Panic(
            type = expr.type.fixSelf(expectedType = context),
            expr = expr.expr.tryFixType(expectedType = StringType)
        )

        override fun visit(expr: FunApp, context: CheckedTypeExpr): CheckedExpr {
            val funExprType = expr.funExpr.type.fixSelf(expectedType = null) as FunctionType
            if (context != funExprType.returnType) {
                throw UnexpectedTypeError(
                    expected = context,
                    actual = funExprType.returnType,
                    range = errorRange
                )
            }
            return FunApp(
                type = expr.type.fixSelf(expectedType = context),
                funExpr = expr.funExpr.tryFixType(expectedType = funExprType),
                arguments = expr.arguments.checkedZip(other = funExprType.argumentTypes).map { (e, t) ->
                    e.tryFixType(expectedType = t)
                }
            )
        }

        override fun visit(expr: Binary, context: CheckedTypeExpr): CheckedExpr {
            val (newE1, newE2) = when (expr.operator) {
                MUL, DIV, MOD, PLUS, MINUS, LT, LE, GT, GE -> {
                    expr.e1.tryFixType(expectedType = IntType) to expr.e2.tryFixType(expectedType = IntType)
                }
                AND, OR -> {
                    expr.e1.tryFixType(expectedType = BoolType) to expr.e2.tryFixType(expectedType = BoolType)
                }
                NE, EQ -> {
                    val t1 = expr.e1.type.fixSelf(expectedType = null)
                    val t2 = expr.e1.type.fixSelf(expectedType = null)
                    if (t1 != t2) {
                        throw UnexpectedTypeError(
                            expected = t1,
                            actual = t2,
                            range = errorRange
                        )
                    }
                    val newE1 = expr.e1.tryFixType(expectedType = t1)
                    val newE2 = expr.e2.tryFixType(expectedType = t1)
                    newE1 to newE2
                }
            }
            return Binary(
                type = expr.type.fixSelf(expectedType = context),
                e1 = newE1,
                operator = expr.operator,
                e2 = newE2
            )
        }

        override fun visit(expr: IfElse, context: CheckedTypeExpr): CheckedExpr = IfElse(
            type = expr.type.fixSelf(expectedType = context),
            boolExpr = expr.boolExpr.tryFixType(expectedType = BoolType),
            e1 = expr.e1.tryFixType(expectedType = context),
            e2 = expr.e2.tryFixType(expectedType = context)
        )

        override fun visit(expr: Match, context: CheckedTypeExpr): CheckedExpr {
            val matchedExprType = expr.matchedExpr.type.fixSelf(expectedType = null) as IdentifierType
            return Match(
                type = expr.type.fixSelf(expectedType = context),
                matchedExpr = expr.matchedExpr.tryFixType(expectedType = matchedExprType),
                matchingList = expr.matchingList.map { (tag, dataVar, e) ->
                    Match.VariantPatternToExpr(
                        tag = tag,
                        dataVariable = dataVar,
                        expr = e.tryFixType(expectedType = context)
                    )
                }
            )
        }

        override fun visit(expr: Lambda, context: CheckedTypeExpr): CheckedExpr {
            val newType = expr.type.fixSelf(expectedType = context) as FunctionType
            return Lambda(
                type = newType,
                arguments = expr.arguments.checkedZip(other = newType.argumentTypes).map { (vAndOriginalT, t) ->
                    val (v, originalT) = vAndOriginalT
                    v to originalT.fixSelf(expectedType = t)
                },
                body = expr.body.tryFixType(expectedType = newType.returnType)
            )
        }

        override fun visit(expr: Val, context: CheckedTypeExpr): CheckedExpr {
            if (expr.nextExpr == null && context != UnitType) {
                throw UnexpectedTypeError(expected = context, actual = UnitType, range = errorRange)
            }
            return Val(
                type = expr.type.fixSelf(expectedType = context),
                pattern = expr.pattern,
                assignedExpr = expr.assignedExpr.run { tryFixType(expectedType = type.fixSelf(expectedType = null)) },
                nextExpr = expr.nextExpr?.tryFixType(expectedType = context)
            )
        }

    }

}
