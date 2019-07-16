package samlang.parser

import org.antlr.v4.runtime.ANTLRInputStream
import org.antlr.v4.runtime.CommonTokenStream
import samlang.ast.Program
import samlang.errors.MissingFileError
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLLexer
import samlang.parser.generated.PLParser
import samlang.util.createProgramOrFail
import java.io.File
import java.io.InputStream

object ProgramBuilder {

    private fun buildProgram(inputStream: InputStream): Program {
        val parser = PLParser(CommonTokenStream(PLLexer(ANTLRInputStream(inputStream))))
        val errorListener = SyntaxErrorListener()
        parser.removeErrorListeners()
        parser.addErrorListener(errorListener)
        val programVisitor = Visitor(syntaxErrorListener = errorListener)
        val programContext = parser.program()
        val program = programContext.accept(programVisitor)
        val errors = errorListener.syntaxErrors
        return createProgramOrFail(program = program, errors = errors)
    }

    fun buildProgramFromSingleFile(fileDir: String): Program =
        File(fileDir)
            .takeIf { it.isFile }
            ?.let { buildProgram(inputStream = it.inputStream()) }
            ?: throw MissingFileError(dirName = fileDir)

    fun buildProgramFromText(text: String): Program = buildProgram(inputStream = text.byteInputStream())

    private class Visitor(syntaxErrorListener: SyntaxErrorListener) : PLBaseVisitor<Program>() {

        private val moduleBuilder: ModuleBuilder = ModuleBuilder(syntaxErrorListener = syntaxErrorListener)

        override fun visitProgram(ctx: PLParser.ProgramContext): Program =
            Program(
                imports = ctx.importSource().map { importNode ->
                    val importedSourceIdNode = importNode.UpperId().symbol
                    importedSourceIdNode.text to importNode.range
                },
                modules = ctx.module().map { it.accept(moduleBuilder) }
            )
    }
}
