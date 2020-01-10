package samlang.parser

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

    private object FieldNameBuilder : PLBaseVisitor<Pattern.ObjectPattern.DestructedName?>() {

        override fun visitRawVar(ctx: PLParser.RawVarContext): Pattern.ObjectPattern.DestructedName =
            ctx.LowerId().symbol.let {
                Pattern.ObjectPattern.DestructedName(
                    fieldName = it.text,
                    fieldOrder = -1,
                    alias = null,
                    range = it.range
                )
            }

        override fun visitRenamedVar(ctx: PLParser.RenamedVarContext): Pattern.ObjectPattern.DestructedName {
            val idList = ctx.LowerId()
            return Pattern.ObjectPattern.DestructedName(
                fieldName = idList[0].symbol.text,
                fieldOrder = -1,
                alias = idList[1].symbol.text,
                range = ctx.range
            )
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
