package samlang.ast.common

import org.antlr.v4.runtime.ParserRuleContext
import org.antlr.v4.runtime.Token

data class Position(val lineStart: Int, val lineEnd: Int, val colStart: Int, val colEnd: Int) {

    private data class Loc(val line: Int, val col: Int) : Comparable<Loc> {

        override fun compareTo(other: Loc): Int {
            val c = line.compareTo(other = other.line)
            return if (c != 0) c else col.compareTo(other = other.col)
        }

    }

    infix fun union(other: Position): Position {
        val start = minOf(
            Loc(line = lineStart, col = colStart),
            Loc(line = other.lineStart, col = other.colStart)
        )
        val end = maxOf(
            Loc(line = lineEnd, col = colEnd),
            Loc(line = other.lineEnd, col = other.colEnd)
        )
        return Position(
            lineStart = start.line, lineEnd = end.line,
            colStart = start.col, colEnd = end.col
        )
    }

    override fun toString(): String = "$lineStart:$colStart~$lineEnd:$colEnd"

    data class WithName(val position: Position, val name: String)

    internal companion object {

        val Token.position: Position
            get() = Position(
                lineStart = line, lineEnd = line,
                colStart = charPositionInLine, colEnd = charPositionInLine + text.length
            )

        val Token.positionWithName: WithName
            get() = WithName(
                position = position,
                name = text
            )

        val ParserRuleContext.position: Position
            get() {
                val startPos = start.position
                val endPos = stop.position
                return Position(
                    lineStart = startPos.lineStart, lineEnd = endPos.lineEnd,
                    colStart = startPos.colStart, colEnd = endPos.colEnd
                )
            }

    }

}
