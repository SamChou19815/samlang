package samlang.ast.ts

/**
 * All patterns that can be used in const destructing.
 */
sealed class TsPattern {

    /**
     * A tuple pattern like `[t1, t2]`.
     */
    data class TuplePattern(val destructedNames: List<String?>) : TsPattern()

    /**
     * An object pattern like `{ foo, bar }`.
     */
    data class ObjectPattern(val destructedNames: List<Pair<String, String?>>) : TsPattern()

    /**
     * A simple variable pattern like `var1`.
     */
    data class VariablePattern(val name: String) : TsPattern()

    /**
     * A wildcard pattern `_` that matches everything.
     */
    object WildCardPattern : TsPattern()
}
