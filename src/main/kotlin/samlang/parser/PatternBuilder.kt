package samlang.parser

import samlang.ast.common.Range
import samlang.ast.raw.RawPattern
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLParser

internal object PatternBuilder : PLBaseVisitor<RawPattern>() {

    override fun visitTuplePattern(ctx: PLParser.TuplePatternContext): RawPattern = RawPattern.TuplePattern(
        range = ctx.range,
        destructedNames = ctx.varOrWildCard().map { c -> c.LowerId()?.symbol?.rangeWithName }
    )

    private object FieldNameBuilder : PLBaseVisitor<Pair<Range.WithName, Range.WithName?>>() {

        override fun visitRawVar(ctx: PLParser.RawVarContext): Pair<Range.WithName, Range.WithName?> =
            ctx.LowerId().symbol.rangeWithName to null

        override fun visitRenamedVar(ctx: PLParser.RenamedVarContext): Pair<Range.WithName, Range.WithName> =
            ctx.LowerId()[0].symbol.rangeWithName to ctx.LowerId()[1].symbol.rangeWithName

    }

    override fun visitObjectPattern(ctx: PLParser.ObjectPatternContext): RawPattern = RawPattern.ObjectPattern(
        range = ctx.range,
        destructedNames = ctx.varOrRenamedVar().map { it.accept(FieldNameBuilder) }
    )

    override fun visitVariablePattern(ctx: PLParser.VariablePatternContext): RawPattern  =
        RawPattern.VariablePattern(range = ctx.range, name = ctx.text)

    override fun visitWildcardPattern(ctx: PLParser.WildcardPatternContext): RawPattern =
        RawPattern.WildCardPattern(range = ctx.range)

}
