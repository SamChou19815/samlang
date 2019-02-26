package samlang.demo

import samlang.ast.checked.CheckedProgram
import samlang.ast.raw.RawProgram
import samlang.checker.ProgramTypeChecker
import samlang.checker.TypeCheckingContext
import samlang.compiler.printer.PrettyPrinter
import samlang.errors.CompileTimeError
import samlang.errors.SyntaxErrors
import samlang.interpreter.PanicException
import samlang.interpreter.ProgramInterpreter
import samlang.parser.ProgramBuilder
import java.io.ByteArrayOutputStream
import java.io.PrintStream
import java.nio.charset.Charset
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread

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
     */
    @JvmStatic
    fun interpret(programString: String): Response {
        val rawProgram: RawProgram
        try {
            rawProgram = ProgramBuilder.buildProgramFromText(text = programString)
        } catch (e: SyntaxErrors) {
            return Response(type = WebDemoController.Type.BAD_SYNTAX, detail = e.errorMessage)
        }
        val checkedProgram: CheckedProgram
        try {
            checkedProgram = ProgramTypeChecker.typeCheck(program = rawProgram, ctx = TypeCheckingContext.EMPTY)
        } catch (e: CompileTimeError) {
            return Response(type = WebDemoController.Type.BAD_TYPE, detail = e.errorMessage)
        }
        // passed all the compile time checks, start to interpret
        val atomicStringValue = AtomicReference<String>()
        val evalThread = thread(start = true) {
            val callback = try {
                "Value: ${ProgramInterpreter.eval(program = checkedProgram)}"
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
        val stringOut = ByteArrayOutputStream()
        PrintStream(stringOut, true, "UTF-8").use { PrettyPrinter.prettyPrint(checkedProgram, it) }
        val charset = Charset.forName("UTF-8")
        val prettyPrintedProgram = String(bytes = stringOut.toByteArray(), charset = charset)
        return Response(
            type = WebDemoController.Type.GOOD_PROGRAM,
            detail = WebDemoController.SuccessResponseDetail(
                result = result,
                prettyPrintedProgram = prettyPrintedProgram
            )
        )
    }

}
