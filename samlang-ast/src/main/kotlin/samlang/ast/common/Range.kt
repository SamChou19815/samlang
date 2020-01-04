package samlang.ast.common

data class Range(val start: Position, val end: Position) {
    operator fun contains(position: Position): Boolean = position in start..end

    operator fun contains(range: Range): Boolean = contains(position = range.start) && contains(position = range.end)

    infix fun union(other: Range): Range =
        Range(start = minOf(a = start, b = other.start), end = maxOf(a = end, b = other.end))

    override fun toString(): String = "$start-$end"

    companion object {
        @JvmField
        val DUMMY: Range = Range(
            start = Position.DUMMY,
            end = Position.DUMMY
        )
    }
}
