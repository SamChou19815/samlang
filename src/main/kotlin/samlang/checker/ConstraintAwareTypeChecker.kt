package samlang.checker

import samlang.ast.Range
import samlang.ast.Type
import samlang.ast.Type.*
import samlang.ast.TypeVisitor
import samlang.errors.SizeMismatchError
import samlang.errors.TypeParamSizeMismatchError
import samlang.errors.UnexpectedTypeError

internal class ConstraintAwareTypeChecker(val resolution: TypeResolution) {

    fun checkAndInfer(expectedType: Type, actualType: Type, errorRange: Range): Type =
        actualType.accept(visitor = Visitor(errorRange = errorRange), context = expectedType)

    /**
     * typeExpr -> actual type, not allowed to have free type
     * context -> expected type, if it's undecided type, we need to resolve it.
     */
    private inner class Visitor(private val errorRange: Range) : TypeVisitor<Type, Type> {

        private fun meet(actualType: Type, expectedType: Type): Type =
            actualType.accept(visitor = this@Visitor, context = expectedType)

        private fun Type.failOnExpected(expectedType: Type): Nothing =
            throw UnexpectedTypeError(expected = expectedType, actual = this, range = errorRange)

        private fun Type.meetWithUndecidedType(undecidedType: UndecidedType): Type {
            val resolvedType =
                resolution.addTypeResolution(undecidedTypeIndex = undecidedType.index, decidedType = this)
            if (resolvedType === this) {
                return this
            }
            // Check consistency.
            return meet(actualType = this, expectedType = resolvedType)
        }

        override fun visit(type: PrimitiveType, context: Type): Type = when {
            context is UndecidedType -> type.meetWithUndecidedType(undecidedType = context)
            type == context -> type
            else -> type.failOnExpected(expectedType = context)
        }

        override fun visit(type: IdentifierType, context: Type): Type = when (context) {
            is UndecidedType -> type.meetWithUndecidedType(undecidedType = context)
            is IdentifierType -> {
                if (type.identifier != context.identifier) {
                    type.failOnExpected(expectedType = context)
                }
                val inferredTypeArguments = TypeParamSizeMismatchError.check(
                    expectedList = context.typeArguments,
                    actualList = type.typeArguments,
                    range = errorRange
                )?.map { (expect, actual) -> meet(actualType = actual, expectedType = expect) }
                type.copy(typeArguments = inferredTypeArguments)
            }
            else -> type.failOnExpected(expectedType = context)
        }

        override fun visit(type: TupleType, context: Type): Type = when (context) {
            is UndecidedType -> type.meetWithUndecidedType(undecidedType = context)
            is TupleType -> type.copy(
                mappings = SizeMismatchError.checkNotNull(
                    sizeDescription = "tuple",
                    expectedList = context.mappings,
                    actualList = type.mappings,
                    range = errorRange
                ).map { (expect, actual) -> meet(actualType = actual, expectedType = expect) }
            )
            else -> type.failOnExpected(expectedType = context)
        }

        override fun visit(type: FunctionType, context: Type): Type = when (context) {
            is UndecidedType -> type.meetWithUndecidedType(undecidedType = context)
            is FunctionType -> type.copy(
                argumentTypes = SizeMismatchError.checkNotNull(
                    sizeDescription = "function parameters",
                    expectedList = context.argumentTypes,
                    actualList = type.argumentTypes,
                    range = errorRange
                ).map { (expect, actual) -> meet(actualType = actual, expectedType = expect) },
                returnType = meet(actualType = type.returnType, expectedType = context.returnType)
            )
            else -> type.failOnExpected(expectedType = context)
        }

        override fun visit(type: UndecidedType, context: Type): Type = when (context) {
            is UndecidedType -> resolution.establishAliasing(
                undecidedType1 = type,
                undecidedType2 = context,
                meet = this@Visitor::meet
            )
            else -> context.meetWithUndecidedType(undecidedType = type)
        }
    }
}
