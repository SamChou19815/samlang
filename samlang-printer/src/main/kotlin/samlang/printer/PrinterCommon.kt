package samlang.printer

import samlang.util.PrintDevice
import samlang.util.StringBuilderPrintDevice

internal fun printToDevice(printer: (device: PrintDevice) -> Unit): String {
    val device = StringBuilderPrintDevice()
    printer(device)
    return device.dump()
}

internal fun <T> typeParametersToString(typeParameters: List<T>): String =
    typeParameters
        .takeIf { it.isNotEmpty() }
        ?.joinToString(separator = ", ", prefix = "<", postfix = ">")
        ?: ""
