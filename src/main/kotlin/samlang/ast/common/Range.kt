package samlang.ast.common

data class Range(val start: Position, val end: Position) {

    infix fun union(other: Range): Range =
        Range(start = minOf(a = start, b = other.start), end = maxOf(a = end, b = other.end))

    override fun toString(): String = "$start-$end"

    data class WithName(val range: Range, val name: String)

}
