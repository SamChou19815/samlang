package samlang.parser

import samlang.ast.common.Range
import samlang.ast.lang.Pattern
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLParser

internal object PatternBuilder : PLBaseVisitor<Pattern?>() {

    override fun visitTuplePattern(ctx: PLParser.TuplePatternContext): Pattern = Pattern.TuplePattern(
        range = ctx.range,
        destructedNames = ctx.varOrWildCard().map { c ->
            val range = c.range
            c.LowerId()?.symbol?.text to range
        }
    )

    private object FieldNameBuilder : PLBaseVisitor<Triple<String, String?, Range>?>() {

        override fun visitRawVar(ctx: PLParser.RawVarContext): Triple<String, String?, Range> =
            ctx.LowerId().symbol.let { Triple(first = it.text, second = null, third = it.range) }

        override fun visitRenamedVar(ctx: PLParser.RenamedVarContext): Triple<String, String?, Range> {
            val idList = ctx.LowerId()
            return Triple(first = idList[0].symbol.text, second = idList[1].symbol.text, third = ctx.range)
        }
    }

    override fun visitObjectPattern(ctx: PLParser.ObjectPatternContext): Pattern? {
        val destructedNames = ctx.varOrRenamedVar().map { it.accept(FieldNameBuilder) ?: return null }
        return Pattern.ObjectPattern(range = ctx.range, destructedNames = destructedNames)
    }

    override fun visitVariablePattern(ctx: PLParser.VariablePatternContext): Pattern =
        Pattern.VariablePattern(range = ctx.range, name = ctx.text)

    override fun visitWildcardPattern(ctx: PLParser.WildcardPatternContext): Pattern =
        Pattern.WildCardPattern(range = ctx.range)
}
