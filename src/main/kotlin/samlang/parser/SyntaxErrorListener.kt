package samlang.parser

import org.antlr.v4.runtime.BaseErrorListener
import org.antlr.v4.runtime.RecognitionException
import org.antlr.v4.runtime.Recognizer
import org.antlr.v4.runtime.Token
import samlang.ast.Position
import samlang.ast.Range
import samlang.errors.CompileTimeError
import samlang.errors.SyntaxError

internal class SyntaxErrorListener : BaseErrorListener() {

    private val _syntaxErrors: MutableList<SyntaxError> = arrayListOf()

    val syntaxErrors: List<CompileTimeError> get() = _syntaxErrors

    fun addSyntaxError(syntaxError: SyntaxError) {
        _syntaxErrors.add(element = syntaxError)
    }

    override fun syntaxError(
        recognizer: Recognizer<*, *>?,
        offendingSymbol: Any?,
        line: Int,
        charPositionInLine: Int,
        reason: String,
        e: RecognitionException?
    ) {
        val position = Position(line = line - 1, column = charPositionInLine) // LSP position
        val range = (offendingSymbol as? Token)?.range ?: Range(
            start = position,
            end = Position(line = line - 1, column = charPositionInLine + 1)
        )
        _syntaxErrors.add(element = SyntaxError(range = range, reason = reason))
    }
}
