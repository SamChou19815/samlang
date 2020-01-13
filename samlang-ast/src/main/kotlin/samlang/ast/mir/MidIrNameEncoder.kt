package samlang.ast.mir

import samlang.ast.common.ModuleReference

object MidIrNameEncoder {
    val nameOfThrow: String = encodeBuiltinName(name = "throw")
    val nameOfMalloc: String = encodeBuiltinName(name = "malloc")
    val nameOfStringToInt: String = encodeBuiltinName(name = "stringToInt")
    val nameOfIntToString: String = encodeBuiltinName(name = "intToString")
    val nameOfPrintln: String = encodeBuiltinName(name = "println")
    const val compiledProgramMain: String = "_compiled_program_main"

    private fun encodeBuiltinName(name: String): String = "_builtin_$name"

    fun encodeFunctionName(moduleReference: ModuleReference, className: String, functionName: String): String {
        val encodedModuleReference = moduleReference.parts.joinToString(separator = "__") {
            it.replace(oldChar = '-', newChar = '_')
        }
        return "_module_${encodedModuleReference}_class_${className}_function_$functionName"
    }

    fun encodeMainFunctionName(moduleReference: ModuleReference): String =
        encodeFunctionName(moduleReference = moduleReference, className = "Main", functionName = "main")
}
