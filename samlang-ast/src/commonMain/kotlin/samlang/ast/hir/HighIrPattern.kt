package samlang.ast.hir

/** All patterns that can be used in const destructing. */
sealed class HighIrPattern {
    /** A tuple pattern like `[t1, t2]`. */
    data class TuplePattern(val destructedNames: List<String?>) : HighIrPattern() {
        override fun toString(): String =
            destructedNames.joinToString(separator = ", ", prefix = "[", postfix = "]") { it ?: "" }
    }

    /** A simple variable pattern like `var1`.  */
    data class VariablePattern(val name: String) : HighIrPattern() {
        override fun toString(): String = name
    }

    /** A wildcard pattern `_` that matches everything. */
    object WildCardPattern : HighIrPattern() {
        override fun toString(): String = "_"
    }
}
