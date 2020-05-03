package samlang.server

import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread
import samlang.ast.common.ModuleReference
import samlang.checker.ErrorCollector
import samlang.checker.typeCheckSingleModuleSource
import samlang.errors.CompilationFailedException
import samlang.interpreter.ModuleInterpreter
import samlang.interpreter.PanicException
import samlang.parser.ModuleBuilder
import samlang.printer.prettyPrint

/**
 * A controller for web demo of SAMLANG.
 * Objects and functions defined here are designed to be easily used by a web server.
 */
internal object WebDemoController {

    /**
     * All possible types of response.
     */
    enum class Type { GOOD_PROGRAM, BAD_SYNTAX, BAD_TYPE }

    /**
     * The response detail shape for a success.
     *
     * @param result the result in string obtained by the interpreter. It can be a value or error.
     * @param prettyPrintedProgram a fully type-annotated program.
     */
    data class SuccessResponseDetail(val result: String, val prettyPrintedProgram: String)

    /**
     * The response to the client.
     *
     * @param type type of response.
     * @param detail detail of the response. Shapes of the response are different for different types of response.
     */
    data class Response(val type: Type, val detail: Any)

    /**
     * Interpret a [programString] and try to return an interpreted value and the type-annotated pretty-printed
     * program.
     * Otherwise, return appropriate error responses.
     */
    @JvmStatic
    fun interpret(programString: String): Response {
        val moduleReference = ModuleReference(moduleName = "Demo")
        val (rawModule, parseErrors) = ModuleBuilder.buildModuleFromText(
            moduleReference = moduleReference,
            text = programString
        )
        if (parseErrors.isNotEmpty()) {
            val detail = parseErrors.joinToString(separator = "\n") { it.errorMessage }
            return Response(type = Type.BAD_SYNTAX, detail = detail)
        }
        val errorCollector = ErrorCollector()
        val checkedModule = typeCheckSingleModuleSource(module = rawModule, errorCollector = errorCollector)
        if (errorCollector.collectedErrors.isNotEmpty()) {
            val errors = errorCollector.collectedErrors.map { it.withErrorModule(moduleReference) }
            return Response(type = Type.BAD_TYPE, detail = CompilationFailedException(errors = errors).errorMessage)
        }
        // passed all the compile time checks, start to interpret
        val atomicStringValue = AtomicReference<String>()
        val evalThread = thread {
            val callback = try {
                "Value: ${ModuleInterpreter().eval(module = checkedModule)}"
            } catch (e: PanicException) {
                "Panic: ${e.reason}"
            }
            atomicStringValue.set(callback)
        }
        evalThread.join(1000) // impose time limit
        val result: String = atomicStringValue.get() ?: kotlin.run {
            @Suppress(names = ["DEPRECATION"])
            evalThread.stop()
            "Panic: TimeLimitExceeded (1s)"
        }
        // now pretty-print
        val prettyPrintedProgram = prettyPrint(module = checkedModule)
        return Response(
            type = Type.GOOD_PROGRAM,
            detail = SuccessResponseDetail(result = result, prettyPrintedProgram = prettyPrintedProgram)
        )
    }
}
