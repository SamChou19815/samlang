package samlang.parser

import org.antlr.v4.runtime.ANTLRInputStream
import org.antlr.v4.runtime.CommonTokenStream
import samlang.ast.Source
import samlang.errors.MissingFileError
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLLexer
import samlang.parser.generated.PLParser
import samlang.util.createSourceOrFail
import java.io.File
import java.io.InputStream

object SourceBuilder {

    private fun buildSource(inputStream: InputStream): Source {
        val parser = PLParser(CommonTokenStream(PLLexer(ANTLRInputStream(inputStream))))
        val errorListener = SyntaxErrorListener()
        parser.removeErrorListeners()
        parser.addErrorListener(errorListener)
        val sourceVisitor = Visitor(syntaxErrorListener = errorListener)
        val sourceContext = parser.source()
        val source = sourceContext.accept(sourceVisitor)
        val errors = errorListener.syntaxErrors
        return createSourceOrFail(source = source, errors = errors)
    }

    fun buildSourceFromSingleFile(fileDir: String): Source =
        File(fileDir)
            .takeIf { it.isFile }
            ?.let { buildSource(inputStream = it.inputStream()) }
            ?: throw MissingFileError(dirName = fileDir)

    fun buildSourceFromText(text: String): Source = buildSource(inputStream = text.byteInputStream())

    private class Visitor(syntaxErrorListener: SyntaxErrorListener) : PLBaseVisitor<Source>() {

        private val moduleBuilder: ModuleBuilder = ModuleBuilder(syntaxErrorListener = syntaxErrorListener)

        override fun visitSource(ctx: PLParser.SourceContext): Source =
            Source(
                imports = ctx.importSource().map { importNode ->
                    val importedSourceIdNode = importNode.UpperId().symbol
                    importedSourceIdNode.text to importNode.range
                },
                modules = ctx.module().map { it.accept(moduleBuilder) }
            )
    }
}
