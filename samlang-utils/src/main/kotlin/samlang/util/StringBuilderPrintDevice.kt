package samlang.util

class StringBuilderPrintDevice : PrintDevice {
    private val builder: StringBuilder = StringBuilder()

    override fun print(x: Any) {
        builder.append(x)
    }

    override fun println(x: Any) {
        builder.append(x).append('\n')
    }

    override fun println() {
        builder.append('\n')
    }

    fun dump(): String = builder.toString()
}
