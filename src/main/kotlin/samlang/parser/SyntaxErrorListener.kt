package samlang.parser

import org.antlr.v4.runtime.BaseErrorListener
import org.antlr.v4.runtime.RecognitionException
import org.antlr.v4.runtime.Recognizer

internal class SyntaxErrorListener : BaseErrorListener() {

    private val syntaxErrorCollection: MutableList<Pair<Int, String>> = arrayListOf()

    val syntaxErrors: List<Pair<Int, String>> get() = syntaxErrorCollection

    override fun syntaxError(_1: Recognizer<*, *>?, _2: Any?, l: Int, _3: Int, m: String, _4: RecognitionException?) {
        syntaxErrorCollection.add(element = l to m)
    }

}
