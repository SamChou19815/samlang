package samlang.ast.lang

import samlang.ast.common.Range

/**
 * All patterns that can be used in val destructing.
 */
sealed class Pattern {
    abstract val range: Range

    /**
     * A tuple pattern like `[t1, t2]`.
     */
    data class TuplePattern(
        override val range: Range,
        val destructedNames: List<String?>
    ) : Pattern()

    /**
     * An object pattern like `{ foo, bar }`.
     */
    data class ObjectPattern(
        override val range: Range,
        val destructedNames: List<Pair<String, String?>>
    ) : Pattern()

    /**
     * A simple variable pattern like `var1`.
     */
    data class VariablePattern(
        override val range: Range,
        val name: String
    ) : Pattern()

    /**
     * A wildcard pattern `_` that matches everything.
     */
    data class WildCardPattern(override val range: Range) : Pattern()
}
