package samlang.parser

import samlang.ast.Type
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLParser

internal object TypeBuilder : PLBaseVisitor<Type>() {

    override fun visitUnitType(ctx: PLParser.UnitTypeContext): Type = Type.unit
    override fun visitBoolType(ctx: PLParser.BoolTypeContext): Type = Type.bool
    override fun visitIntType(ctx: PLParser.IntTypeContext): Type = Type.int
    override fun visitStrType(ctx: PLParser.StrTypeContext): Type = Type.string

    override fun visitSingleIdentifierType(ctx: PLParser.SingleIdentifierTypeContext): Type =
        Type.IdentifierType(
            identifier = ctx.UpperId().symbol.text,
            typeArguments = ctx.typeParameters()?.let { params ->
                params.typeExpr().map { it.accept(TypeBuilder) }
            }
        )

    override fun visitTupleType(ctx: PLParser.TupleTypeContext): Type = Type.TupleType(
        mappings = ctx.typeExpr().map { it.accept(TypeBuilder) }
    )

    override fun visitFunctionType(ctx: PLParser.FunctionTypeContext): Type {
        val types = ctx.typeExpr()
        return Type.FunctionType(
            argumentTypes = types.subList(
                fromIndex = 0,
                toIndex = types.size - 1
            ).map { it.accept(TypeBuilder) },
            returnType = types.last().accept(TypeBuilder)
        )
    }
}
