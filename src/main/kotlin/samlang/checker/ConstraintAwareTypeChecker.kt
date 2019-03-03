package samlang.checker

import samlang.ast.checked.CheckedTypeExpr
import samlang.ast.checked.CheckedTypeExpr.*
import samlang.ast.checked.CheckedTypeExprVisitor
import samlang.errors.SizeMismatchError
import samlang.errors.TypeParamSizeMismatchError
import samlang.errors.UnexpectedTypeError
import samlang.parser.Position
import samlang.util.Either

internal class ConstraintAwareTypeChecker(val manager: UndecidedTypeManager) {

    fun checkAndInfer(
        expectedType: CheckedTypeExpr,
        actualType: CheckedTypeExpr,
        errorPosition: Position
    ): CheckedTypeExpr = actualType.accept(visitor = Visitor(errorPosition = errorPosition), context = expectedType)

    /**
     * typeExpr -> actual type, not allowed to have free type
     * context -> expected type, if it's undecided type, we need to resolve it.
     */
    private inner class Visitor(
        private val errorPosition: Position
    ) : CheckedTypeExprVisitor<CheckedTypeExpr, CheckedTypeExpr> {

        private fun CheckedTypeExpr.checkAndInfer(expectedType: CheckedTypeExpr): CheckedTypeExpr =
            accept(visitor = this@Visitor, context = expectedType)

        private fun CheckedTypeExpr.failOnExpected(expectedType: CheckedTypeExpr): Nothing =
            throw UnexpectedTypeError(expected = expectedType, actual = this, position = errorPosition)

        private fun Either<CheckedTypeExpr, UndecidedTypeManager.InconsistentTypeReport>.getType(): CheckedTypeExpr =
            when (this) {
                is Either.Left -> v
                is Either.Right -> {
                    val (existingType, newType) = v
                    newType.failOnExpected(expectedType = existingType)
                }
            }

        private fun CheckedTypeExpr.inferUndecidedType(undecidedType: UndecidedType): CheckedTypeExpr =
            manager.tryReportDecisionForUndecidedType(
                undecidedTypeIndex = undecidedType.index, decidedType = this
            ).getType()

        override fun visit(typeExpr: UnitType, context: CheckedTypeExpr): CheckedTypeExpr = when (context) {
            UnitType, FreeType -> typeExpr
            is UndecidedType -> typeExpr.inferUndecidedType(undecidedType = context)
            else -> typeExpr.failOnExpected(expectedType = context)
        }

        override fun visit(typeExpr: IntType, context: CheckedTypeExpr): CheckedTypeExpr = when (context) {
            IntType, FreeType -> typeExpr
            is UndecidedType -> typeExpr.inferUndecidedType(undecidedType = context)
            else -> typeExpr.failOnExpected(expectedType = context)
        }

        override fun visit(typeExpr: StringType, context: CheckedTypeExpr): CheckedTypeExpr = when (context) {
            StringType, FreeType -> typeExpr
            is UndecidedType -> typeExpr.inferUndecidedType(undecidedType = context)
            else -> typeExpr.failOnExpected(expectedType = context)
        }

        override fun visit(typeExpr: BoolType, context: CheckedTypeExpr): CheckedTypeExpr = when (context) {
            BoolType, FreeType -> typeExpr
            is UndecidedType -> typeExpr.inferUndecidedType(undecidedType = context)
            else -> typeExpr.failOnExpected(expectedType = context)
        }

        override fun visit(typeExpr: IdentifierType, context: CheckedTypeExpr): CheckedTypeExpr = when (context) {
            FreeType -> typeExpr
            is IdentifierType -> {
                if (typeExpr.identifier != context.identifier) {
                    typeExpr.failOnExpected(expectedType = context)
                }
                val inferredTypeArgs = TypeParamSizeMismatchError.check(
                    expectedList = context.typeArgs,
                    actualList = typeExpr.typeArgs,
                    position = errorPosition
                )?.map { (expect, actual) -> actual.checkAndInfer(expectedType = expect) }
                typeExpr.copy(typeArgs = inferredTypeArgs)
            }
            is UndecidedType -> typeExpr.inferUndecidedType(undecidedType = context)
            else -> typeExpr.failOnExpected(expectedType = context)
        }

        override fun visit(typeExpr: TupleType, context: CheckedTypeExpr): CheckedTypeExpr = when (context) {
            FreeType -> typeExpr
            is TupleType -> TupleType(
                mappings = SizeMismatchError.checkNotNull(
                    sizeDescription = "tuple",
                    expectedList = context.mappings,
                    actualList = typeExpr.mappings,
                    position = errorPosition
                ).map { (expect, actual) -> actual.checkAndInfer(expectedType = expect) }
            )
            is UndecidedType -> typeExpr.inferUndecidedType(undecidedType = context)
            else -> typeExpr.failOnExpected(expectedType = context)
        }

        override fun visit(typeExpr: FunctionType, context: CheckedTypeExpr): CheckedTypeExpr = when (context) {
            FreeType -> typeExpr
            is FunctionType -> FunctionType(
                argumentTypes = SizeMismatchError.checkNotNull(
                    sizeDescription = "function arguments",
                    expectedList = context.argumentTypes,
                    actualList = typeExpr.argumentTypes,
                    position = errorPosition
                ).map { (expect, actual) -> actual.checkAndInfer(expectedType = expect) },
                returnType = typeExpr.returnType.checkAndInfer(expectedType = context.returnType)
            )
            is UndecidedType -> typeExpr.inferUndecidedType(undecidedType = context)
            else -> typeExpr.failOnExpected(expectedType = context)
        }

        override fun visit(typeExpr: UndecidedType, context: CheckedTypeExpr): CheckedTypeExpr = when (context) {
            FreeType -> typeExpr
            is UndecidedType -> manager.establishAliasing(index1 = typeExpr.index, index2 = context.index).getType()
            else -> context.inferUndecidedType(undecidedType = typeExpr)
        }

        override fun visit(typeExpr: FreeType, context: CheckedTypeExpr): CheckedTypeExpr =
            error(message = "Not allowed to be free type because it's not the constraint.")

    }

}

