package samlang.parser

import samlang.ast.Type
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLParser

internal object TypeExpressionBuilder : PLBaseVisitor<Type>() {

    override fun visitUnitType(ctx: PLParser.UnitTypeContext): Type = Type.unit(range = ctx.UNIT().symbol.range)
    override fun visitBoolType(ctx: PLParser.BoolTypeContext): Type = Type.bool(range = ctx.BOOL().symbol.range)
    override fun visitIntType(ctx: PLParser.IntTypeContext): Type = Type.int(range = ctx.INT().symbol.range)
    override fun visitStrType(ctx: PLParser.StrTypeContext): Type = Type.string(range = ctx.STRING().symbol.range)

    override fun visitSingleIdentifierType(ctx: PLParser.SingleIdentifierTypeContext): Type =
        Type.IdentifierType(
            range = ctx.range,
            identifier = ctx.UpperId().symbol.text,
            typeArguments = ctx.typeParameters()?.let { params ->
                params.typeExpr().map { it.accept(TypeExpressionBuilder) }
            }
        )

    override fun visitTupleType(ctx: PLParser.TupleTypeContext): Type = Type.TupleType(
        range = ctx.range,
        mappings = ctx.typeExpr().map { it.accept(TypeExpressionBuilder) }
    )

    override fun visitFunctionType(ctx: PLParser.FunctionTypeContext): Type {
        val types = ctx.typeExpr()
        return Type.FunctionType(
            range = ctx.range,
            argumentTypes = types.subList(
                fromIndex = 0,
                toIndex = types.size - 1
            ).map { it.accept(TypeExpressionBuilder) },
            returnType = types.last().accept(TypeExpressionBuilder)
        )
    }

}
