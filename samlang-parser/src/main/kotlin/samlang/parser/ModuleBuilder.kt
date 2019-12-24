package samlang.parser

import java.io.InputStream
import org.antlr.v4.runtime.ANTLRInputStream
import org.antlr.v4.runtime.CommonTokenStream
import samlang.ast.common.ModuleMembersImport
import samlang.ast.common.ModuleReference
import samlang.ast.lang.Module
import samlang.errors.CompilationFailedException
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLLexer
import samlang.parser.generated.PLParser
import samlang.util.createOrFail

object ModuleBuilder {

    fun buildModule(moduleReference: ModuleReference, inputStream: InputStream): Module {
        val parser = PLParser(CommonTokenStream(PLLexer(ANTLRInputStream(inputStream))))
        val errorListener = SyntaxErrorListener(moduleReference = moduleReference)
        parser.removeErrorListeners()
        parser.addErrorListener(errorListener)
        val sourceVisitor = Visitor(syntaxErrorListener = errorListener)
        val moduleContext = parser.module()
        val errors = errorListener.syntaxErrors
        if (errors.isNotEmpty()) {
            throw CompilationFailedException(errors = errors)
        }
        val module = moduleContext.accept(sourceVisitor)
        return createOrFail(item = module, errors = errors)
    }

    fun buildModuleFromText(moduleReference: ModuleReference, text: String): Module =
        buildModule(moduleReference = moduleReference, inputStream = text.byteInputStream())

    private class Visitor(syntaxErrorListener: SyntaxErrorListener) : PLBaseVisitor<Module>() {

        private val classBuilder: ClassBuilder = ClassBuilder(syntaxErrorListener = syntaxErrorListener)

        private fun buildModuleMembersImport(ctx: PLParser.ImportModuleMembersContext): ModuleMembersImport =
            ModuleMembersImport(
                range = ctx.range,
                importedMembers = ctx.UpperId().map { node ->
                    val symbol = node.symbol
                    symbol.text to symbol.range
                },
                importedModule = ModuleReference(parts = ctx.moduleReference().UpperId().map { it.text }),
                importedModuleRange = ctx.moduleReference().range
            )

        override fun visitModule(ctx: PLParser.ModuleContext): Module =
            Module(
                imports = ctx.importModuleMembers().map(transform = ::buildModuleMembersImport),
                classDefinitions = ctx.clazz().map { it.accept(classBuilder) }
            )
    }
}
