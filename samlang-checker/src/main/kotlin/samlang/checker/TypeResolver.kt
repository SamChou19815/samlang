package samlang.checker

import samlang.ast.common.Type
import samlang.ast.common.Type.FunctionType
import samlang.ast.common.Type.IdentifierType
import samlang.ast.common.Type.PrimitiveType
import samlang.ast.common.Type.TupleType
import samlang.ast.common.Type.UndecidedType
import samlang.ast.common.TypeVisitor

internal object TypeResolver {
    internal fun resolveType(type: Type, function: (UndecidedType) -> Type): Type =
        type.accept(visitor = TypeResolverVisitor, context = function)

    private object TypeResolverVisitor : TypeVisitor<(UndecidedType) -> Type, Type> {

        override fun visit(type: PrimitiveType, context: (UndecidedType) -> Type): Type = type

        override fun visit(type: IdentifierType, context: (UndecidedType) -> Type): Type =
            type.copy(typeArguments = type.typeArguments.map { it.accept(visitor = this, context = context) })

        override fun visit(type: TupleType, context: (UndecidedType) -> Type): Type =
            type.copy(mappings = type.mappings.map { it.accept(visitor = this, context = context) })

        override fun visit(type: FunctionType, context: (UndecidedType) -> Type): Type =
            type.copy(
                argumentTypes = type.argumentTypes.map { it.accept(visitor = this, context = context) },
                returnType = type.returnType.accept(visitor = this, context = context)
            )

        override fun visit(type: UndecidedType, context: (UndecidedType) -> Type): Type = context(type)
    }
}
