package samlang.parser

import org.antlr.v4.runtime.ParserRuleContext
import org.antlr.v4.runtime.Token
import samlang.ast.common.Position
import samlang.ast.common.Range

internal val Token.startPosition: Position
    get() = Position(
        line = line - 1,
        column = charPositionInLine
    )

private val Token.endPosition: Position
    get() = Position(
        line = line - 1,
        column = charPositionInLine + text.length
    )

internal val Token.range: Range
    get() = Range(
        start = startPosition,
        end = endPosition
    )

internal val ParserRuleContext.range: Range
    get() = Range(
        start = start.startPosition,
        end = stop.endPosition
    )
