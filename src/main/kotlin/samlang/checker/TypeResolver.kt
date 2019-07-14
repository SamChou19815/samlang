package samlang.checker

import samlang.ast.Type
import samlang.ast.Type.FunctionType
import samlang.ast.Type.IdentifierType
import samlang.ast.Type.PrimitiveType
import samlang.ast.Type.TupleType
import samlang.ast.Type.UndecidedType
import samlang.ast.TypeVisitor

private typealias ResolveTypeFunction = (undecidedType: UndecidedType) -> Type

internal fun Type.resolveType(function: ResolveTypeFunction): Type =
    accept(visitor = TypeResolverVisitor, context = function)

private object TypeResolverVisitor :
    TypeVisitor<ResolveTypeFunction, Type> {

    override fun visit(type: PrimitiveType, context: ResolveTypeFunction): Type = type

    override fun visit(type: IdentifierType, context: ResolveTypeFunction): Type =
        type.copy(typeArguments = type.typeArguments?.map { it.resolveType(function = context) })

    override fun visit(type: TupleType, context: ResolveTypeFunction): Type =
        type.copy(mappings = type.mappings.map { it.resolveType(function = context) })

    override fun visit(type: FunctionType, context: ResolveTypeFunction): Type =
        type.copy(
            argumentTypes = type.argumentTypes.map { it.resolveType(function = context) },
            returnType = type.returnType.resolveType(function = context)
        )

    override fun visit(type: UndecidedType, context: ResolveTypeFunction): Type = context(type)
}
