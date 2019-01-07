package samlang.parser

import samlang.ast.raw.RawTypeExpr
import samlang.parser.Position.Companion.position
import samlang.parser.Position.Companion.positionWithName
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLParser

internal object TypeExprBuilder : PLBaseVisitor<RawTypeExpr>() {

    override fun visitUnitType(ctx: PLParser.UnitTypeContext): RawTypeExpr =
        RawTypeExpr.UnitType(position = ctx.UNIT().symbol.position)

    override fun visitIntType(ctx: PLParser.IntTypeContext): RawTypeExpr =
        RawTypeExpr.IntType(position = ctx.INT().symbol.position)

    override fun visitStrType(ctx: PLParser.StrTypeContext): RawTypeExpr =
        RawTypeExpr.StringType(position = ctx.STRING().symbol.position)

    override fun visitBoolType(ctx: PLParser.BoolTypeContext): RawTypeExpr =
        RawTypeExpr.BoolType(position = ctx.BOOL().symbol.position)

    override fun visitSingleIdentifierType(ctx: PLParser.SingleIdentifierTypeContext): RawTypeExpr =
        RawTypeExpr.IdentifierType(
            position = ctx.position,
            identifier = ctx.UpperId().symbol.positionWithName,
            typeArgs = ctx.typeParameters()?.let { params ->
                params.typeExpr().map { it.accept(TypeExprBuilder) }
            }
        )

    override fun visitTupleType(ctx: PLParser.TupleTypeContext): RawTypeExpr = RawTypeExpr.TupleType(
        position = ctx.position,
        mappings = ctx.typeExpr().map { it.accept(TypeExprBuilder) }
    )

    override fun visitFunctionType(ctx: PLParser.FunctionTypeContext): RawTypeExpr {
        val types = ctx.typeExpr()
        return RawTypeExpr.FunctionType(
            position = ctx.position,
            argumentTypes = types.subList(fromIndex = 0, toIndex = types.size - 1).map { it.accept(TypeExprBuilder) },
            returnType = types.last().accept(TypeExprBuilder)
        )
    }

}