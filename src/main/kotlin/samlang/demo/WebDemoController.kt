package samlang.demo

import samlang.ast.Module
import samlang.checker.typeCheck
import samlang.compiler.printer.PrettyPrinter
import samlang.errors.CompilationFailedException
import samlang.interpreter.PanicException
import samlang.interpreter.SourceInterpreter
import samlang.parser.ModuleBuilder
import java.io.ByteArrayOutputStream
import java.io.PrintStream
import java.nio.charset.Charset
import java.util.concurrent.ThreadFactory
import java.util.concurrent.atomic.AtomicReference

/**
 * A controller for web demo of SAMLANG.
 * Objects and functions defined here are designed to be easily used by a web server.
 */
object WebDemoController {

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
            rawModule = ModuleBuilder.buildModuleFromText(text = programString)
        } catch (compilationFailedException: CompilationFailedException) {
            return Response(type = WebDemoController.Type.BAD_SYNTAX, detail = compilationFailedException.errorMessage)
        }
        val checkedProgram = try {
            rawModule.typeCheck()
        } catch (compilationFailedException: CompilationFailedException) {
            return Response(type = WebDemoController.Type.BAD_TYPE, detail = compilationFailedException.errorMessage)
        }
        // passed all the compile time checks, start to interpret
        val atomicStringValue = AtomicReference<String>()
        val evalThread = threadFactory.newThread {
            val callback = try {
                "Value: ${SourceInterpreter.eval(module = checkedProgram)}"
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
        PrintStream(stringOut, true, "UTF-8").use { PrettyPrinter.prettyPrint(checkedProgram, it) }
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
