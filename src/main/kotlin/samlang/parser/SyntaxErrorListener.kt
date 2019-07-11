package samlang.parser

import org.antlr.v4.runtime.BaseErrorListener
import org.antlr.v4.runtime.RecognitionException
import org.antlr.v4.runtime.Recognizer
import samlang.ast.Position
import samlang.errors.CompileTimeError
import samlang.errors.SyntaxError

internal class SyntaxErrorListener : BaseErrorListener() {

    private val _syntaxErrors: MutableList<SyntaxError> = arrayListOf()

    val syntaxErrors: List<CompileTimeError> get() = _syntaxErrors

    override fun syntaxError(
        recognizer: Recognizer<*, *>,
        offendingSymbol: Any?,
        line: Int,
        charPositionInLine: Int,
        reason: String,
        e: RecognitionException?
    ) {
        val position = Position(line = line - 1, column = charPositionInLine) // LSP position
        _syntaxErrors.add(element = SyntaxError(position = position, reason = reason))
    }

}
