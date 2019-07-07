package samlang.checker

import samlang.ast.Range
import samlang.ast.Type
import samlang.ast.Type.*
import samlang.ast.TypeVisitor
import samlang.errors.SizeMismatchError
import samlang.errors.TypeParamSizeMismatchError
import samlang.errors.UnexpectedTypeError

internal class ConstraintAwareTypeChecker(val manager: UndecidedTypeManager) {

    fun checkAndInfer(
        expectedType: Type,
        actualType: Type,
        errorRange: Range
    ): Type = actualType.accept(visitor = Visitor(errorRange = errorRange), context = expectedType)

    /**
     * typeExpr -> actual type, not allowed to have free type
     * context -> expected type, if it's undecided type, we need to resolve it.
     */
    private inner class Visitor(
        private val errorRange: Range
    ) : TypeVisitor<Type, Type> {

        private fun Type.checkAndInfer(expectedType: Type): Type =
            accept(visitor = this@Visitor, context = expectedType)

        private fun Type.failOnExpected(expectedType: Type): Nothing =
            throw UnexpectedTypeError(expected = expectedType, actual = this, range = errorRange)

        private fun Type.inferUndecidedType(undecidedType: UndecidedType): Type =
            manager.tryReportDecisionForUndecidedType(
                undecidedTypeIndex = undecidedType.index, decidedType = this,
                resolve = { expectedType -> checkAndInfer(expectedType) }
            )

        override fun visit(type: PrimitiveType, context: Type): Type = when (context) {
            is PrimitiveType -> if (type isNotConsistentWith context) type.failOnExpected(expectedType = context) else type
            is UndecidedType -> type.inferUndecidedType(undecidedType = context)
            else -> type.failOnExpected(expectedType = context)
        }

        override fun visit(type: IdentifierType, context: Type): Type = when (context) {
            is IdentifierType -> {
                if (type.identifier != context.identifier) {
                    type.failOnExpected(expectedType = context)
                }
                val inferredTypeArguments = TypeParamSizeMismatchError.check(
                    expectedList = context.typeArguments,
                    actualList = type.typeArguments,
                    range = errorRange
                )?.map { (expect, actual) -> actual.checkAndInfer(expectedType = expect) }
                type.copy(typeArguments = inferredTypeArguments)
            }
            is UndecidedType -> type.inferUndecidedType(undecidedType = context)
            else -> type.failOnExpected(expectedType = context)
        }

        override fun visit(type: TupleType, context: Type): Type = when (context) {
            is TupleType -> type.copy(
                mappings = SizeMismatchError.checkNotNull(
                    sizeDescription = "tuple",
                    expectedList = context.mappings,
                    actualList = type.mappings,
                    range = errorRange
                ).map { (expect, actual) -> actual.checkAndInfer(expectedType = expect) }
            )
            is UndecidedType -> type.inferUndecidedType(undecidedType = context)
            else -> type.failOnExpected(expectedType = context)
        }

        override fun visit(type: FunctionType, context: Type): Type = when (context) {
            is FunctionType -> type.copy(
                argumentTypes = SizeMismatchError.checkNotNull(
                    sizeDescription = "function arguments",
                    expectedList = context.argumentTypes,
                    actualList = type.argumentTypes,
                    range = errorRange
                ).map { (expect, actual) -> actual.checkAndInfer(expectedType = expect) },
                returnType = type.returnType.checkAndInfer(expectedType = context.returnType)
            )
            is UndecidedType -> type.inferUndecidedType(undecidedType = context)
            else -> type.failOnExpected(expectedType = context)
        }

        override fun visit(type: UndecidedType, context: Type): Type = when (context) {
            is UndecidedType -> manager.establishAliasing(
                undecidedType1 = type,
                undecidedType2 = context,
                resolve = { expectedType -> checkAndInfer(expectedType) }
            )
            else -> context.inferUndecidedType(undecidedType = type)
        }

    }

}

