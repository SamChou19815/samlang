package samlang.checker

import samlang.ast.common.Range
import samlang.ast.common.Type
import samlang.ast.common.Type.FunctionType
import samlang.ast.common.Type.IdentifierType
import samlang.ast.common.Type.PrimitiveType
import samlang.ast.common.Type.TupleType
import samlang.ast.common.Type.UndecidedType
import samlang.ast.common.TypeVisitor
import samlang.errors.NotWellDefinedIdentifierError

internal object TypeValidator {
    fun validateType(
        type: Type,
        identifierTypeValidator: IdentifierTypeValidator,
        errorCollector: ErrorCollector,
        errorRange: Range
    ): Boolean {
        val badIdentifier = validateType(type = type, identifierTypeValidator = identifierTypeValidator)
            ?: return true
        errorCollector.add(NotWellDefinedIdentifierError(badIdentifier = badIdentifier, range = errorRange))
        return false
    }

    /** Exposed for test */
    fun validateType(type: Type, identifierTypeValidator: IdentifierTypeValidator): String? {
        val visitor = Visitor()
        type.accept(visitor = visitor, context = identifierTypeValidator)
        return visitor.badIdentifier
    }

    /** A validator for type to check whether every identifier type is well defined.*/
    private class Visitor : TypeVisitor<IdentifierTypeValidator, Boolean> {
        var badIdentifier: String? = null

        override fun visit(type: PrimitiveType, context: IdentifierTypeValidator): Boolean = true

        override fun visit(type: IdentifierType, context: IdentifierTypeValidator): Boolean {
            val (name, typeArguments) = type
            if (!context.identifierTypeIsWellDefined(name = name, typeArgumentLength = typeArguments.size)) {
                badIdentifier = name
                return false
            }
            return validate(list = typeArguments, context = context)
        }

        override fun visit(type: TupleType, context: IdentifierTypeValidator): Boolean =
            validate(list = type.mappings, context = context)

        override fun visit(type: FunctionType, context: IdentifierTypeValidator): Boolean =
            validate(list = type.argumentTypes, context = context) &&
                    type.returnType.accept(visitor = this, context = context)

        override fun visit(type: UndecidedType, context: IdentifierTypeValidator): Boolean = true

        private fun validate(list: List<Type>, context: IdentifierTypeValidator): Boolean =
            list.all { it.accept(visitor = this, context = context) }
    }
}
