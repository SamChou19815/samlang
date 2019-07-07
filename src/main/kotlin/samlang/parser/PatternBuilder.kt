package samlang.parser

import samlang.ast.common.Position
import samlang.ast.raw.RawPattern
import samlang.ast.common.Position.Companion.position
import samlang.ast.common.Position.Companion.positionWithName
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLParser

internal object PatternBuilder : PLBaseVisitor<RawPattern>() {

    override fun visitTuplePattern(ctx: PLParser.TuplePatternContext): RawPattern = RawPattern.TuplePattern(
        position = ctx.position,
        destructedNames = ctx.varOrWildCard().map { c -> c.LowerId()?.symbol?.positionWithName }
    )

    private object FieldNameBuilder : PLBaseVisitor<Pair<Position.WithName, Position.WithName?>>() {

        override fun visitRawVar(ctx: PLParser.RawVarContext): Pair<Position.WithName, Position.WithName?> =
            ctx.LowerId().symbol.positionWithName to null

        override fun visitRenamedVar(ctx: PLParser.RenamedVarContext): Pair<Position.WithName, Position.WithName> =
            ctx.LowerId()[0].symbol.positionWithName to ctx.LowerId()[1].symbol.positionWithName

    }

    override fun visitObjectPattern(ctx: PLParser.ObjectPatternContext): RawPattern = RawPattern.ObjectPattern(
        position = ctx.position,
        destructedNames = ctx.varOrRenamedVar().map { it.accept(FieldNameBuilder) }
    )

    override fun visitVariablePattern(ctx: PLParser.VariablePatternContext): RawPattern  =
        RawPattern.VariablePattern(position = ctx.position, name = ctx.text)

    override fun visitWildcardPattern(ctx: PLParser.WildcardPatternContext): RawPattern =
        RawPattern.WildCardPattern(position = ctx.position)

}
