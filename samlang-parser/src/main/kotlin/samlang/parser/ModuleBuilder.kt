package samlang.parser

import org.antlr.v4.runtime.CharStreams
import org.antlr.v4.runtime.CommonTokenStream
import samlang.ast.common.ModuleMembersImport
import samlang.ast.common.ModuleReference
import samlang.ast.common.Type
import samlang.ast.lang.*
import samlang.errors.CompileTimeError
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLLexer
import samlang.parser.generated.PLParser

fun buildModuleFromText(moduleReference: ModuleReference, text: String): Pair<Module, List<CompileTimeError>> {
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

fun buildExpressionFromText(
    moduleReference: ModuleReference,
    source: String
): Pair<Expression?, List<CompileTimeError>> = ExpressionBuilder.build(source, moduleReference)

private class Visitor(syntaxErrorListener: SyntaxErrorListener) : PLBaseVisitor<Module?>() {
    private val moduleMemberVisitor: ModuleMemberVisitor =
        ModuleMemberVisitor(syntaxErrorListener = syntaxErrorListener)

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
            classDefinitions = ctx.moduleMember().mapNotNull { it.accept(moduleMemberVisitor) }
        )
}

private class ModuleMemberVisitor(syntaxErrorListener: SyntaxErrorListener) : PLBaseVisitor<ClassDefinition?>() {
    private val classBuilder: ClassBuilder = ClassBuilder(syntaxErrorListener = syntaxErrorListener)

    override fun visitClassAsModuleMember(ctx: PLParser.ClassAsModuleMemberContext): ClassDefinition? =
        ctx.clazz()?.accept(classBuilder)

    private val PLParser.TypeParametersDeclarationContext.typeParameters: List<String> get() =
        UpperId().map { it.symbol.text }

    private fun parseInterface(ctx: PLParser): ClassDeclaration? =
        ctx.interfaze()?.let { interfaceNode ->
            val nameSymbol = interfaceNode.UpperId().symbol
            ClassDeclaration(
                range = interfaceNode.range,
                nameRange = nameSymbol.range,
                name = nameSymbol.text,
                isPublic = interfaceNode.PRIVATE() == null,
                members = interfaceNode.classMemberDeclaration().map { memberDeclaration ->
                    val memberNameSymbol = memberDeclaration.LowerId().symbol
                    val parameters = memberDeclaration.annotatedVariable().map { annotatedVariable ->
                        val parameterNameSymbol = annotatedVariable.LowerId().symbol
                        val typeExpression = annotatedVariable.typeAnnotation()?.typeExpr()
                        AnnotatedParameter(
                            name = parameterNameSymbol.text,
                            nameRange = parameterNameSymbol.range,
                            type = typeExpression?.accept(TypeBuilder) ?: return null,
                            typeRange = typeExpression.range
                        )
                    }
                    ClassDeclaration.MemberDeclaration(
                        range = memberDeclaration.range,
                        isPublic = memberDeclaration.PRIVATE() != null,
                        isMethod = memberDeclaration.METHOD() != null,
                        nameRange = memberNameSymbol.range,
                        name = memberNameSymbol.text,
                        typeParameters = ctx.typeParametersDeclaration()?.typeParameters ?: emptyList(),
                        type = Type.FunctionType(
                            argumentTypes = parameters.map { it.type },
                            returnType = ctx.typeExpr()?.accept(TypeBuilder) ?: return null
                        ),
                        parameters = parameters
                    )
                }
            )
        }
}
