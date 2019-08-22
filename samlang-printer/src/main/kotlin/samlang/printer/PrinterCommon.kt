package samlang.printer

import java.io.OutputStream
import java.io.PrintStream

internal fun printToStream(printer: (stream: PrintStream) -> Unit): String {
    val stringPrintStream = StringPrintStream()
    printer(stringPrintStream)
    return stringPrintStream.printedString
}

private class StringPrintStream : PrintStream(StringBuilderOutputStream(), true) {

    private class StringBuilderOutputStream : OutputStream() {

        val sb = StringBuilder()

        override fun write(b: Int) {
            sb.append(b.toChar())
        }
    }

    val printedString: String get() = (out as StringBuilderOutputStream).sb.toString()
}

internal fun <T> typeParametersToString(typeParameters: List<T>): String =
    typeParameters
        .takeIf { it.isNotEmpty() }
        ?.joinToString(separator = ", ", prefix = "<", postfix = ">")
        ?: ""
