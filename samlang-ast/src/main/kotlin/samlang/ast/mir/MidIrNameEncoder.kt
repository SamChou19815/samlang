package samlang.ast.mir

import samlang.ast.common.ModuleReference

object MidIrNameEncoder {
    val nameOfThrow: String = encodeBuiltinName(name = "throw")
    val nameOfStringToInt: String = encodeBuiltinName(name = "stringToInt")
    val nameOfIntToString: String = encodeBuiltinName(name = "intToString")
    val nameOfPrintln: String = encodeBuiltinName(name = "println")

    private fun encodeBuiltinName(name: String): String = "builtin_$name"

    fun encodeFunctionName(moduleReference: ModuleReference, className: String, functionName: String): String =
        "function_${moduleReference.parts.joinToString(separator = "__")}_${className}_$functionName"
}
