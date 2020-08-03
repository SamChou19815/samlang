package samlang.util

class StringBuilderPrintDevice {
    private val builder: StringBuilder = StringBuilder()

    fun print(x: Any) {
        builder.append(x)
    }

    fun println(x: Any) {
        builder.append(x).append('\n')
    }

    fun println() {
        builder.append('\n')
    }

    fun dump(): String = builder.toString()
}
