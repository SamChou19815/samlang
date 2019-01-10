package samlang.parser

import org.antlr.v4.runtime.BaseErrorListener
import org.antlr.v4.runtime.RecognitionException
import org.antlr.v4.runtime.Recognizer
import org.antlr.v4.runtime.Token

internal class SyntaxErrorListener : BaseErrorListener() {

    private val syntaxErrorCollection: MutableList<Triple<Int, Int, String>> = arrayListOf()

    val syntaxErrors: List<Triple<Int, Int, String>> get() = syntaxErrorCollection

    override fun syntaxError(
        recognizer: Recognizer<*, *>,
        offendingSymbol: Any?,
        line: Int,
        charPositionInLine: Int,
        msg: String,
        e: RecognitionException?
    ) {
        syntaxErrorCollection.add(element = Triple(line, charPositionInLine, msg))
    }

}
