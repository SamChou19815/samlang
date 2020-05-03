package samlang.util

import java.io.PrintStream

class PrintStreamPrintDevice(private val printStream: PrintStream) : PrintDevice {
    override fun print(x: Any): Unit = printStream.print(x)
    override fun println(x: Any): Unit = printStream.println(x)
    override fun println(): Unit = printStream.println()
}
