package samlang.parser

import org.antlr.v4.runtime.CharStreams
import org.antlr.v4.runtime.CommonTokenStream
import samlang.ast.common.ModuleMembersImport
import samlang.ast.common.ModuleReference
import samlang.ast.lang.Expression
import samlang.ast.lang.Module
import samlang.errors.CompileTimeError
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLLexer
import samlang.parser.generated.PLParser

actual fun buildModuleFromText(moduleReference: ModuleReference, text: String): Pair<Module, List<CompileTimeError>> {
    val parser = PLParser(CommonTokenStream(PLLexer(CharStreams.fromString(text))))
    val errorListener = SyntaxErrorListener(moduleReference = moduleReference)
    parser.removeErrorListeners()
    parser.addErrorListener(errorListener)
    val sourceVisitor = Visitor(syntaxErrorListener = errorListener)
    val moduleContext = parser.module()
    val errors = errorListener.syntaxErrors
    val module = moduleContext.accept(sourceVisitor)
        ?: Module(imports = emptyList(), classDefinitions = emptyList())
    return module to errors
}

actual fun buildExpressionFromText(
    moduleReference: ModuleReference,
    source: String
): Pair<Expression?, List<CompileTimeError>> = ExpressionBuilder.build(source, moduleReference)

private class Visitor(syntaxErrorListener: SyntaxErrorListener) : PLBaseVisitor<Module?>() {

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
            classDefinitions = ctx.clazz().mapNotNull { it.accept(classBuilder) }
        )
}
