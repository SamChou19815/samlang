package samlang.util

/** A platform independent interface for printing. */
interface PrintDevice {
    fun print(x: Any)
    fun println(x: Any)
    fun println()
}
