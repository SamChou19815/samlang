package samlang.checker

import samlang.ast.common.Range
import samlang.ast.common.Type
import samlang.ast.common.Type.FunctionType
import samlang.ast.common.Type.IdentifierType
import samlang.ast.common.Type.PrimitiveType
import samlang.ast.common.Type.TupleType
import samlang.ast.common.Type.UndecidedType
import samlang.ast.common.TypeVisitor
import samlang.errors.UnexpectedTypeError

internal class ConstraintAwareTypeChecker(val resolution: TypeResolution, private val errorCollector: ErrorCollector) {

    fun checkAndInfer(expectedType: Type, actualType: Type, errorRange: Range): Type {
        val partiallyResolvedActualType = resolution.resolveType(unresolvedType = actualType)
        val partiallyResolvedExpectedType = resolution.resolveType(unresolvedType = expectedType)
        return try {
            partiallyResolvedActualType.accept(
                visitor = Visitor(errorRange = errorRange),
                context = partiallyResolvedExpectedType
            )
        } catch (_: ConflictError) {
            errorCollector.add(
                compileTimeError = UnexpectedTypeError(
                    expected = partiallyResolvedExpectedType,
                    actual = partiallyResolvedActualType,
                    range = errorRange
                )
            )
            partiallyResolvedExpectedType
        }
    }

    private class ConflictError : RuntimeException()

    /**
     * typeExpr -> actual type, not allowed to have free type
     * context -> expected type, if it's undecided type, we need to resolve it.
     */
    private inner class Visitor(private val errorRange: Range) :
        TypeVisitor<Type, Type> {

        private fun meet(actualType: Type, expectedType: Type): Type =
            actualType.accept(visitor = this@Visitor, context = expectedType)

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
            else -> throw ConflictError()
        }

        override fun visit(type: IdentifierType, context: Type): Type = when (context) {
            is UndecidedType -> type.meetWithUndecidedType(undecidedType = context)
            is IdentifierType -> {
                if (type.identifier != context.identifier || context.typeArguments.size != type.typeArguments.size) {
                    throw ConflictError()
                }
                val inferredTypeArguments = context.typeArguments
                    .zip(other = type.typeArguments)
                    .map { (expect, actual) -> meet(actualType = actual, expectedType = expect) }
                type.copy(typeArguments = inferredTypeArguments)
            }
            else -> throw ConflictError()
        }

        override fun visit(type: TupleType, context: Type): Type = when (context) {
            is UndecidedType -> type.meetWithUndecidedType(undecidedType = context)
            is TupleType -> {
                if (context.mappings.size != type.mappings.size) {
                    throw ConflictError()
                }
                val meetMappings = context.mappings
                    .zip(other = type.mappings)
                    .map { (expect, actual) -> meet(actualType = actual, expectedType = expect) }
                type.copy(mappings = meetMappings)
            }
            else -> throw ConflictError()
        }

        override fun visit(type: FunctionType, context: Type): Type = when (context) {
            is UndecidedType -> type.meetWithUndecidedType(undecidedType = context)
            is FunctionType -> {
                if (context.argumentTypes.size != type.argumentTypes.size) {
                    throw ConflictError()
                }
                val meetArguments = context.argumentTypes
                    .zip(other = type.argumentTypes)
                    .map { (expect, actual) -> meet(actualType = actual, expectedType = expect) }
                val meetReturn = meet(actualType = type.returnType, expectedType = context.returnType)
                type.copy(argumentTypes = meetArguments, returnType = meetReturn)
            }
            else -> throw ConflictError()
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
