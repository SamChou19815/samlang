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

internal fun validateType(
    type: Type,
    accessibleGlobalTypingContext: AccessibleGlobalTypingContext,
    errorCollector: ErrorCollector,
    errorRange: Range
): Boolean = type.accept(
    visitor = TypeValidator(errorCollector = errorCollector, errorRange = errorRange),
    context = accessibleGlobalTypingContext
)

/** A validator for type to check whether every identifier type is well defined.*/
private class TypeValidator(private val errorCollector: ErrorCollector, private val errorRange: Range) :
    TypeVisitor<AccessibleGlobalTypingContext, Boolean> {

    override fun visit(type: PrimitiveType, context: AccessibleGlobalTypingContext): Boolean = true

    override fun visit(type: IdentifierType, context: AccessibleGlobalTypingContext): Boolean {
        val (name, typeArguments) = type
        if (!context.identifierTypeIsWellDefined(name = name, typeArgumentLength = typeArguments.size)) {
            errorCollector.add(NotWellDefinedIdentifierError(badIdentifier = name, range = errorRange))
            return false
        }
        return validate(list = typeArguments, context = context)
    }

    override fun visit(type: TupleType, context: AccessibleGlobalTypingContext): Boolean =
        validate(list = type.mappings, context = context)

    override fun visit(type: FunctionType, context: AccessibleGlobalTypingContext): Boolean =
        validate(list = type.argumentTypes, context = context) &&
                type.returnType.accept(visitor = this, context = context)

    override fun visit(type: UndecidedType, context: AccessibleGlobalTypingContext): Boolean = true

    private fun validate(list: List<Type>, context: AccessibleGlobalTypingContext): Boolean =
        list.all { it.accept(visitor = this, context = context) }
}
