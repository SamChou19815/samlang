package samlang.parser

import org.antlr.v4.runtime.ANTLRInputStream
import org.antlr.v4.runtime.CommonTokenStream
import samlang.ast.Program
import samlang.errors.FileError
import samlang.errors.SyntaxError
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLLexer
import samlang.parser.generated.PLParser
import java.io.File
import java.io.InputStream

object ProgramBuilder {

    private fun buildProgram(inputStream: InputStream): Program {
        val parser = PLParser(CommonTokenStream(PLLexer(ANTLRInputStream(inputStream))))
        val errorListener = SyntaxErrorListener()
        parser.removeErrorListeners()
        parser.addErrorListener(errorListener)
        val programContext = parser.program()
        val errors = errorListener.syntaxErrors
        return if (errors.isEmpty()) {
            programContext.accept(Visitor)
        } else {
            throw SyntaxError(errors = errors)
        }
    }

    fun buildProgramFromSingleFile(fileDir: String): Program =
        File(fileDir)
            .takeIf { it.isFile }
            ?.let { buildProgram(inputStream = it.inputStream()) }
            ?: throw FileError(dirName = fileDir)

    fun buildProgramFromText(text: String): Program = buildProgram(inputStream = text.byteInputStream())

    private object Visitor : PLBaseVisitor<Program>() {

        override fun visitProgram(ctx: PLParser.ProgramContext): Program =
            Program(modules = ctx.module().map { it.accept(ModuleBuilder) })

    }

}
