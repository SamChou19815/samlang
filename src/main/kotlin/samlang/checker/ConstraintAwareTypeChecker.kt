package samlang.checker

import samlang.ast.Range
import samlang.ast.TypeExpression
import samlang.ast.TypeExpression.*
import samlang.ast.TypeExpressionVisitor
import samlang.errors.SizeMismatchError
import samlang.errors.TypeParamSizeMismatchError
import samlang.errors.UnexpectedTypeError
import samlang.util.Either

internal class ConstraintAwareTypeChecker(val manager: UndecidedTypeManager) {

    fun checkAndInfer(
        expectedType: TypeExpression,
        actualType: TypeExpression,
        errorRange: Range
    ): TypeExpression = actualType.accept(visitor = Visitor(errorRange = errorRange), context = expectedType)

    /**
     * typeExpr -> actual type, not allowed to have free type
     * context -> expected type, if it's undecided type, we need to resolve it.
     */
    private inner class Visitor(
        private val errorRange: Range
    ) : TypeExpressionVisitor<TypeExpression, TypeExpression> {

        private fun TypeExpression.checkAndInfer(expectedType: TypeExpression): TypeExpression =
            accept(visitor = this@Visitor, context = expectedType)

        private fun TypeExpression.failOnExpected(expectedType: TypeExpression): Nothing =
            throw UnexpectedTypeError(expected = expectedType, actual = this, range = errorRange)

        private fun TypeExpression.inferUndecidedType(undecidedType: UndecidedType): TypeExpression =
            manager.tryReportDecisionForUndecidedType(
                undecidedTypeIndex = undecidedType.index, decidedType = this,
                resolve = { expectedType -> checkAndInfer(expectedType) }
            )

        override fun visit(typeExpression: UnitType, context: TypeExpression): TypeExpression = when (context) {
            is UnitType -> typeExpression
            is UndecidedType -> typeExpression.inferUndecidedType(undecidedType = context)
            else -> typeExpression.failOnExpected(expectedType = context)
        }

        override fun visit(typeExpression: IntType, context: TypeExpression): TypeExpression = when (context) {
            is IntType -> typeExpression
            is UndecidedType -> typeExpression.inferUndecidedType(undecidedType = context)
            else -> typeExpression.failOnExpected(expectedType = context)
        }

        override fun visit(typeExpression: StringType, context: TypeExpression): TypeExpression = when (context) {
            is StringType -> typeExpression
            is UndecidedType -> typeExpression.inferUndecidedType(undecidedType = context)
            else -> typeExpression.failOnExpected(expectedType = context)
        }

        override fun visit(typeExpression: BoolType, context: TypeExpression): TypeExpression = when (context) {
            is BoolType -> typeExpression
            is UndecidedType -> typeExpression.inferUndecidedType(undecidedType = context)
            else -> typeExpression.failOnExpected(expectedType = context)
        }

        override fun visit(typeExpression: IdentifierType, context: TypeExpression): TypeExpression = when (context) {
            is IdentifierType -> {
                if (typeExpression.identifier != context.identifier) {
                    typeExpression.failOnExpected(expectedType = context)
                }
                val inferredTypeArguments = TypeParamSizeMismatchError.check(
                    expectedList = context.typeArguments,
                    actualList = typeExpression.typeArguments,
                    range = errorRange
                )?.map { (expect, actual) -> actual.checkAndInfer(expectedType = expect) }
                typeExpression.copy(typeArguments = inferredTypeArguments)
            }
            is UndecidedType -> typeExpression.inferUndecidedType(undecidedType = context)
            else -> typeExpression.failOnExpected(expectedType = context)
        }

        override fun visit(typeExpression: TupleType, context: TypeExpression): TypeExpression = when (context) {
            is TupleType -> typeExpression.copy(
                mappings = SizeMismatchError.checkNotNull(
                    sizeDescription = "tuple",
                    expectedList = context.mappings,
                    actualList = typeExpression.mappings,
                    range = errorRange
                ).map { (expect, actual) -> actual.checkAndInfer(expectedType = expect) }
            )
            is UndecidedType -> typeExpression.inferUndecidedType(undecidedType = context)
            else -> typeExpression.failOnExpected(expectedType = context)
        }

        override fun visit(typeExpression: FunctionType, context: TypeExpression): TypeExpression = when (context) {
            is FunctionType -> typeExpression.copy(
                argumentTypes = SizeMismatchError.checkNotNull(
                    sizeDescription = "function arguments",
                    expectedList = context.argumentTypes,
                    actualList = typeExpression.argumentTypes,
                    range = errorRange
                ).map { (expect, actual) -> actual.checkAndInfer(expectedType = expect) },
                returnType = typeExpression.returnType.checkAndInfer(expectedType = context.returnType)
            )
            is UndecidedType -> typeExpression.inferUndecidedType(undecidedType = context)
            else -> typeExpression.failOnExpected(expectedType = context)
        }

        override fun visit(typeExpression: UndecidedType, context: TypeExpression): TypeExpression = when (context) {
            is UndecidedType -> manager.establishAliasing(
                undecidedType1 = typeExpression,
                undecidedType2 = context,
                resolve = { expectedType -> checkAndInfer(expectedType) }
            )
            else -> context.inferUndecidedType(undecidedType = typeExpression)
        }

    }

}

