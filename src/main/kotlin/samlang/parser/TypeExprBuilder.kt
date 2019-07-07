package samlang.parser

import samlang.ast.raw.RawTypeExpr
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLParser

internal object TypeExprBuilder : PLBaseVisitor<RawTypeExpr>() {

    override fun visitUnitType(ctx: PLParser.UnitTypeContext): RawTypeExpr =
        RawTypeExpr.UnitType(range = ctx.UNIT().symbol.range)

    override fun visitIntType(ctx: PLParser.IntTypeContext): RawTypeExpr =
        RawTypeExpr.IntType(range = ctx.INT().symbol.range)

    override fun visitStrType(ctx: PLParser.StrTypeContext): RawTypeExpr =
        RawTypeExpr.StringType(range = ctx.STRING().symbol.range)

    override fun visitBoolType(ctx: PLParser.BoolTypeContext): RawTypeExpr =
        RawTypeExpr.BoolType(range = ctx.BOOL().symbol.range)

    override fun visitSingleIdentifierType(ctx: PLParser.SingleIdentifierTypeContext): RawTypeExpr =
        RawTypeExpr.IdentifierType(
            range = ctx.range,
            identifier = ctx.UpperId().symbol.rangeWithName,
            typeArgs = ctx.typeParameters()?.let { params ->
                params.typeExpr().map { it.accept(TypeExprBuilder) }
            }
        )

    override fun visitTupleType(ctx: PLParser.TupleTypeContext): RawTypeExpr = RawTypeExpr.TupleType(
        range = ctx.range,
        mappings = ctx.typeExpr().map { it.accept(TypeExprBuilder) }
    )

    override fun visitFunctionType(ctx: PLParser.FunctionTypeContext): RawTypeExpr {
        val types = ctx.typeExpr()
        return RawTypeExpr.FunctionType(
            range = ctx.range,
            argumentTypes = types.subList(fromIndex = 0, toIndex = types.size - 1).map { it.accept(TypeExprBuilder) },
            returnType = types.last().accept(TypeExprBuilder)
        )
    }

}
