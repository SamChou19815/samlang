package samlang.ast.common

import org.antlr.v4.runtime.Token

data class Position(val line: Int, val column: Int) : Comparable<Position> {

    override fun compareTo(other: Position): Int {
        val c = line.compareTo(other = other.line)
        return if (c != 0) c else column.compareTo(other = other.column)
    }

    override fun toString(): String = "$line:$column"

}
