package samlang.server

import java.io.ByteArrayOutputStream
import java.io.PrintStream
import java.nio.charset.Charset
import java.util.concurrent.ThreadFactory
import java.util.concurrent.atomic.AtomicReference
import samlang.ast.lang.Module
import samlang.checker.ErrorCollector
import samlang.checker.ModuleTypeChecker
import samlang.checker.TypeCheckingContext
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
     * It uses [threadFactory] to create a new thread.
     */
    @JvmStatic
    fun interpret(programString: String, threadFactory: ThreadFactory): Response {
        val rawModule: Module
        try {
            rawModule = ModuleBuilder.buildModuleFromText(file = "demo.sam", text = programString)
        } catch (compilationFailedException: CompilationFailedException) {
            return Response(
                type = WebDemoController.Type.BAD_SYNTAX,
                detail = compilationFailedException.errorMessage
            )
        }
        val errorCollector = ErrorCollector()
        val (checkedModule, _) = ModuleTypeChecker(errorCollector = errorCollector).typeCheck(
            module = rawModule,
            typeCheckingContext = TypeCheckingContext.EMPTY
        )
        if (errorCollector.collectedErrors.isNotEmpty()) {
            val errors =
                errorCollector.collectedErrors.map { it.withErrorModule(file = "demo.sam") }
            return Response(
                type = WebDemoController.Type.BAD_TYPE,
                detail = CompilationFailedException(errors = errors).errorMessage
            )
        }
        // passed all the compile time checks, start to interpret
        val atomicStringValue = AtomicReference<String>()
        val evalThread = threadFactory.newThread {
            val callback = try {
                "Value: ${ModuleInterpreter.eval(module = checkedModule)}"
            } catch (e: PanicException) {
                "Panic: ${e.reason}"
            }
            atomicStringValue.set(callback)
        }
        evalThread.start()
        evalThread.join(1000) // impose time limit
        val result: String = atomicStringValue.get() ?: kotlin.run {
            @Suppress(names = ["DEPRECATION"])
            evalThread.stop()
            "Panic: TimeLimitExceeded (1s)"
        }
        // now pretty-print
        val stringOut = ByteArrayOutputStream()
        PrintStream(stringOut, true, "UTF-8").use { prettyPrint(checkedModule, it) }
        val charset = Charset.forName("UTF-8")
        val prettyPrintedProgram = String(bytes = stringOut.toByteArray(), charset = charset)
        return Response(
            type = WebDemoController.Type.GOOD_PROGRAM,
            detail = SuccessResponseDetail(
                result = result,
                prettyPrintedProgram = prettyPrintedProgram
            )
        )
    }
}
