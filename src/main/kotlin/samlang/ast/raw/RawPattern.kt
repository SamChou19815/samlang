package samlang.ast.raw

import samlang.ast.common.Range

sealed class RawPattern {

    abstract val range: Range

    data class TuplePattern(
        override val range: Range,
        val destructedNames: List<Range.WithName?>
    ) : RawPattern()

    data class ObjectPattern(
        override val range: Range,
        val destructedNames: List<Pair<Range.WithName, Range.WithName?>>
    ) : RawPattern()

    data class VariablePattern(
        override val range: Range,
        val name: String
    ) : RawPattern()

    data class WildCardPattern(override val range: Range) : RawPattern()

}
