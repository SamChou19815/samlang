package samlang.checker

import samlang.ast.TypeExpression
import samlang.ast.TypeExpression.*
import samlang.ast.TypeExpressionVisitor

private typealias ResolveTypeFunction = (undecidedType: UndecidedType) -> TypeExpression

internal fun TypeExpression.resolveType(function: ResolveTypeFunction): TypeExpression =
    accept(visitor = TypeResolverVisitor, context = function)

private object TypeResolverVisitor :
    TypeExpressionVisitor<ResolveTypeFunction, TypeExpression> {

    override fun visit(typeExpression: UnitType, context: ResolveTypeFunction): TypeExpression = typeExpression
    override fun visit(typeExpression: IntType, context: ResolveTypeFunction): TypeExpression = typeExpression
    override fun visit(typeExpression: StringType, context: ResolveTypeFunction): TypeExpression = typeExpression
    override fun visit(typeExpression: BoolType, context: ResolveTypeFunction): TypeExpression = typeExpression

    override fun visit(typeExpression: IdentifierType, context: ResolveTypeFunction): TypeExpression =
        typeExpression.copy(typeArguments = typeExpression.typeArguments?.map { it.resolveType(function = context) })

    override fun visit(typeExpression: TupleType, context: ResolveTypeFunction): TypeExpression =
        typeExpression.copy(mappings = typeExpression.mappings.map { it.resolveType(function = context) })

    override fun visit(typeExpression: FunctionType, context: ResolveTypeFunction): TypeExpression =
        typeExpression.copy(
            argumentTypes = typeExpression.argumentTypes.map { it.resolveType(function = context) },
            returnType = typeExpression.returnType.resolveType(function = context)
        )

    override fun visit(typeExpression: UndecidedType, context: ResolveTypeFunction): TypeExpression =
        context(typeExpression)

}
