package samlang.ast.checked

sealed class CheckedPattern {
    data class TuplePattern(val destructedNames: List<String?>) : CheckedPattern()
    data class ObjectPattern(val destructedNames: List<Pair<String, String?>>) : CheckedPattern()
    data class VariablePattern(val name: String): CheckedPattern()
    object WildcardPattern : CheckedPattern()
}
