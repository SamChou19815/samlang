package samlang.ast.lang

/**
 * Generic visitor for type-checked type expression node.
 * Each method requires a specific node and a context of type C to produce a result of type T.
 *
 * @param C type of the context during visit.
 * @param T type of the visitor return value.
 */
interface TypeVisitor<in C, out T> {
    fun visit(type: Type.PrimitiveType, context: C): T
    fun visit(type: Type.IdentifierType, context: C): T
    fun visit(type: Type.TupleType, context: C): T
    fun visit(type: Type.FunctionType, context: C): T
    fun visit(type: Type.UndecidedType, context: C): T
}
