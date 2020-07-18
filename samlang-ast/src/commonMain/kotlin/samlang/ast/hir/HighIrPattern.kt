package samlang.ast.hir

/** All patterns that can be used in const destructing. */
sealed class HighIrPattern {
    abstract fun prettyPrint(): String

    final override fun toString(): String = prettyPrint()

    /** A tuple pattern like `[t1, t2]`. */
    data class TuplePattern(val destructedNames: List<String?>) : HighIrPattern() {
        override fun prettyPrint(): String =
            destructedNames.joinToString(separator = ", ", prefix = "[", postfix = "]") { it ?: "" }
    }

    /** A simple variable pattern like `var1`.  */
    data class VariablePattern(val name: String) : HighIrPattern() {
        override fun prettyPrint(): String = name
    }

    /** A wildcard pattern `_` that matches everything. */
    object WildCardPattern : HighIrPattern() {
        override fun prettyPrint(): String = "_"
    }
}
