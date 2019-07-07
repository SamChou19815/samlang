package samlang.parser

import org.antlr.v4.runtime.ParserRuleContext
import org.antlr.v4.runtime.Token
import samlang.ast.common.Position
import samlang.ast.common.Range

val Token.startPosition: Position get() = Position(line = line, column = charPositionInLine)

val Token.endPosition: Position get() = Position(line = line, column = charPositionInLine + text.length)

val Token.range: Range get() = Range(start = startPosition, end = endPosition)

val Token.rangeWithName: Range.WithName get() = Range.WithName(range = range, name = text)

val ParserRuleContext.range: Range get() = Range(start = start.startPosition, end = stop.endPosition)
