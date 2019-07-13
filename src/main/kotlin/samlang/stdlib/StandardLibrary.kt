package samlang.stdlib

object StandardLibrary {
    @JvmField
    val sourceCode: String = javaClass
        .getResourceAsStream("stdlib.sam")
        .bufferedReader()
        .lineSequence()
        .joinToString(separator = "\n", postfix = "\n\n")
}
