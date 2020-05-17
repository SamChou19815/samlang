package samlang.demo

import samlang.ast.common.ModuleReference
import samlang.interpreter.ModuleInterpreter
import samlang.printer.OsTarget
import samlang.printer.prettyPrint
import samlang.service.checkSources
import samlang.service.lowerToOptimizedAssemblyString

class DemoResult(
    val interpreterResult: String? = null,
    val interpreterPrinted: String? = null,
    val prettyPrintedProgram: String? = null,
    val assemblyString: String? = null,
    // Use array for better JS interop
    val errors: Array<String>
)

@ExperimentalStdlibApi
fun runDemo(programString: String): DemoResult {
    val moduleReference = ModuleReference(moduleName = "Program")
    val (checkedModules, compileTimeErrors) = checkSources(sourceHandles = listOf(moduleReference to programString))
    val checkedModule = checkedModules.moduleMappings.entries.first().value
    val errors = compileTimeErrors.map { it.errorMessage }.toTypedArray()
    if (errors.isNotEmpty()) {
        return DemoResult(
            errors = errors
        )
    }
    val interpreter = ModuleInterpreter()
    val interpreterResult = interpreter.eval(module = checkedModule).toString()
    return DemoResult(
        interpreterResult = interpreterResult,
        interpreterPrinted = interpreter.printed,
        prettyPrintedProgram = prettyPrint(module = checkedModule),
        assemblyString = lowerToOptimizedAssemblyString(
            source = checkedModules,
            entryModuleReference = moduleReference,
            osTarget = OsTarget.LINUX
        ),
        errors = errors
    )
}
