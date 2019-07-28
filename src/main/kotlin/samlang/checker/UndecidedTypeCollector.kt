package samlang.checker

import samlang.ast.common.Type
import samlang.ast.common.Type.FunctionType
import samlang.ast.common.Type.IdentifierType
import samlang.ast.common.Type.PrimitiveType
import samlang.ast.common.Type.TupleType
import samlang.ast.common.Type.UndecidedType
import samlang.ast.common.TypeVisitor

/**
 * @return a list of all appeared undecided type indices in [type].
 */
internal fun collectUndecidedTypeIndices(type: Type): List<Int> {
    val visitor = UndecidedTypeCollectorVisitor()
    type.accept(visitor = visitor, context = Unit)
    return visitor.indices
}

private class UndecidedTypeCollectorVisitor : TypeVisitor<Unit, Unit> {

    val indices: MutableList<Int> = mutableListOf()

    override fun visit(type: PrimitiveType, context: Unit) {}

    override fun visit(type: IdentifierType, context: Unit) {
        type.typeArguments.forEach { it.accept(visitor = this, context = Unit) }
    }

    override fun visit(type: TupleType, context: Unit): Unit =
        type.mappings.forEach { it.accept(visitor = this, context = Unit) }

    override fun visit(type: FunctionType, context: Unit) {
        type.argumentTypes.forEach { argumentType -> argumentType.accept(visitor = this, context = Unit) }
        type.returnType.accept(visitor = this, context = Unit)
    }

    override fun visit(type: UndecidedType, context: Unit) {
        indices.add(element = type.index)
    }
}
