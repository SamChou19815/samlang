package samlang.parser

import samlang.ast.lang.Pattern
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLParser

internal object PatternBuilder : PLBaseVisitor<Pattern>() {

    override fun visitTuplePattern(ctx: PLParser.TuplePatternContext): Pattern = Pattern.TuplePattern(
        range = ctx.range,
        destructedNames = ctx.varOrWildCard().map { c -> c.LowerId()?.symbol?.text }
    )

    private object FieldNameBuilder : PLBaseVisitor<Pair<String, String?>>() {

        override fun visitRawVar(ctx: PLParser.RawVarContext): Pair<String, String?> =
            ctx.LowerId().symbol.text to null

        override fun visitRenamedVar(ctx: PLParser.RenamedVarContext): Pair<String, String> {
            val idList = ctx.LowerId()
            return idList[0].symbol.text to idList[1].symbol.text
        }
    }

    override fun visitObjectPattern(ctx: PLParser.ObjectPatternContext): Pattern = Pattern.ObjectPattern(
        range = ctx.range,
        destructedNames = ctx.varOrRenamedVar().map { it.accept(FieldNameBuilder) }
    )

    override fun visitVariablePattern(ctx: PLParser.VariablePatternContext): Pattern =
        Pattern.VariablePattern(range = ctx.range, name = ctx.text)

    override fun visitWildcardPattern(ctx: PLParser.WildcardPatternContext): Pattern =
        Pattern.WildCardPattern(range = ctx.range)
}
