package samlang.parser

import org.antlr.v4.runtime.ANTLRInputStream
import org.antlr.v4.runtime.CommonTokenStream
import samlang.ast.raw.RawProgram
import samlang.errors.FileError
import samlang.errors.SyntaxErrors
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLLexer
import samlang.parser.generated.PLParser
import java.io.File
import java.io.InputStream

object ProgramBuilder {

    private fun buildProgram(inputStream: InputStream): RawProgram {
        val parser = PLParser(CommonTokenStream(PLLexer(ANTLRInputStream(inputStream))))
        val errorListener = SyntaxErrorListener()
        parser.removeErrorListeners()
        parser.addErrorListener(errorListener)
        val programContext = parser.program()
        val errors = errorListener.syntaxErrors
        return if (errors.isEmpty()) {
            programContext.accept(Visitor)
        } else {
            throw SyntaxErrors(errors = errors)
        }
    }

    fun buildProgramFromSingleFile(fileDir: String): RawProgram =
        File(fileDir)
            .takeIf { it.isFile }
            ?.let { buildProgram(inputStream = it.inputStream()) }
            ?: throw FileError(dirName = fileDir)

    fun buildProgramFromText(text: String): RawProgram = buildProgram(inputStream = text.byteInputStream())

    private object Visitor : PLBaseVisitor<RawProgram>() {

        override fun visitProgram(ctx: PLParser.ProgramContext): RawProgram =
            RawProgram(modules = ctx.module().map { it.accept(ModuleBuilder) })

    }

}
