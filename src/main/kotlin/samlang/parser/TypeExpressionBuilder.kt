package samlang.parser

import samlang.ast.TypeExpression
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLParser

internal object TypeExpressionBuilder : PLBaseVisitor<TypeExpression>() {

    override fun visitUnitType(ctx: PLParser.UnitTypeContext): TypeExpression =
        TypeExpression.UnitType(range = ctx.UNIT().symbol.range)

    override fun visitIntType(ctx: PLParser.IntTypeContext): TypeExpression =
        TypeExpression.IntType(range = ctx.INT().symbol.range)

    override fun visitStrType(ctx: PLParser.StrTypeContext): TypeExpression =
        TypeExpression.StringType(range = ctx.STRING().symbol.range)

    override fun visitBoolType(ctx: PLParser.BoolTypeContext): TypeExpression =
        TypeExpression.BoolType(range = ctx.BOOL().symbol.range)

    override fun visitSingleIdentifierType(ctx: PLParser.SingleIdentifierTypeContext): TypeExpression =
        TypeExpression.IdentifierType(
            range = ctx.range,
            identifier = ctx.UpperId().symbol.text,
            typeArguments = ctx.typeParameters()?.let { params ->
                params.typeExpr().map { it.accept(TypeExpressionBuilder) }
            }
        )

    override fun visitTupleType(ctx: PLParser.TupleTypeContext): TypeExpression = TypeExpression.TupleType(
        range = ctx.range,
        mappings = ctx.typeExpr().map { it.accept(TypeExpressionBuilder) }
    )

    override fun visitFunctionType(ctx: PLParser.FunctionTypeContext): TypeExpression {
        val types = ctx.typeExpr()
        return TypeExpression.FunctionType(
            range = ctx.range,
            argumentTypes = types.subList(fromIndex = 0, toIndex = types.size - 1).map { it.accept(TypeExpressionBuilder) },
            returnType = types.last().accept(TypeExpressionBuilder)
        )
    }

}
