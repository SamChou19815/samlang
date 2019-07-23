package samlang.checker

import samlang.ast.Type
import samlang.ast.Type.FunctionType
import samlang.ast.Type.IdentifierType
import samlang.ast.Type.PrimitiveType
import samlang.ast.Type.TupleType
import samlang.ast.Type.UndecidedType
import samlang.ast.TypeVisitor

/**
 * Given a [type] and its [typeParameters], replaces all references to type parameters to freshly created
 * undecided types.
 *
 * @return ([type] with [typeParameters] replaced with undecided types, generated undecided types).
 */
internal fun undecideTypeParameters(
    type: Type,
    typeParameters: List<String>
): Pair<Type, List<UndecidedType>> {
    val autoGeneratedUndecidedTypes = Type.undecidedList(number = typeParameters.size)
    val replacementMap = typeParameters.zip(other = autoGeneratedUndecidedTypes).toMap()
    return type.undecide(context = replacementMap) to autoGeneratedUndecidedTypes
}

/**
 * Given a [typeMappings] and its [typeParameters], replaces all references to type parameters to freshly created
 * undecided types.
 *
 * @return ([typeMappings] with [typeParameters] replaced with undecided types, generated undecided types).
 */
internal fun undecideTypeParameters(
    typeMappings: Map<String, Type>,
    typeParameters: List<String>
): Pair<Map<String, Type>, List<UndecidedType>> {
    val autoGeneratedUndecidedTypes = Type.undecidedList(number = typeParameters.size)
    val replacementMap = typeParameters.zip(other = autoGeneratedUndecidedTypes).toMap()
    val newTypeMappings = typeMappings.mapValues { (_, type) -> type.undecide(context = replacementMap) }
    return newTypeMappings to autoGeneratedUndecidedTypes
}

private fun Type.undecide(context: Map<String, UndecidedType>): Type =
    accept(visitor = UndecideTypeParametersVisitor, context = context)

private object UndecideTypeParametersVisitor :
    TypeVisitor<Map<String, UndecidedType>, Type> {

    override fun visit(type: PrimitiveType, context: Map<String, UndecidedType>): Type = type

    override fun visit(type: IdentifierType, context: Map<String, UndecidedType>): Type {
        val typeArguments = type.typeArguments
        return if (typeArguments != null) {
            val newTypeArguments = typeArguments.map { it.undecide(context = context) }
            type.copy(typeArguments = newTypeArguments)
        } else {
            context[type.identifier] ?: type
        }
    }

    override fun visit(type: TupleType, context: Map<String, UndecidedType>): Type =
        type.copy(mappings = type.mappings.map { it.undecide(context = context) })

    override fun visit(type: FunctionType, context: Map<String, UndecidedType>): Type =
        type.copy(
            argumentTypes = type.argumentTypes.map { it.undecide(context = context) },
            returnType = type.returnType.undecide(context = context)
        )

    override fun visit(type: UndecidedType, context: Map<String, UndecidedType>): Type =
        error(message = "Type expression should not contain undecided type since it's the type of a module member.")
}
