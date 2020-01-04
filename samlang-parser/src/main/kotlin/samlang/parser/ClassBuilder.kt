package samlang.parser

import samlang.ast.common.Range
import samlang.ast.common.Type
import samlang.ast.common.TypeDefinition
import samlang.ast.common.TypeDefinitionType
import samlang.ast.lang.ClassDefinition
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLParser.ClassHeaderContext
import samlang.parser.generated.PLParser.ClassMemberDefinitionContext
import samlang.parser.generated.PLParser.ClazzContext
import samlang.parser.generated.PLParser.ObjTypeContext
import samlang.parser.generated.PLParser.TypeParametersDeclarationContext
import samlang.parser.generated.PLParser.UtilClassHeaderContext
import samlang.parser.generated.PLParser.VariantTypeContext

internal class ClassBuilder(syntaxErrorListener: SyntaxErrorListener) : PLBaseVisitor<ClassDefinition?>() {

    private val expressionBuilder: ExpressionBuilder = ExpressionBuilder(syntaxErrorListener = syntaxErrorListener)

    private val TypeParametersDeclarationContext.typeParameters: List<String> get() = UpperId().map { it.symbol.text }

    private object ModuleNameBuilder : PLBaseVisitor<Pair<String, Range>>() {

        override fun visitClassHeader(ctx: ClassHeaderContext): Pair<String, Range> {
            val symbol = ctx.UpperId().symbol
            return symbol.text to symbol.range
        }

        override fun visitUtilClassHeader(ctx: UtilClassHeaderContext): Pair<String, Range> {
            val symbol = ctx.UpperId().symbol
            return symbol.text to symbol.range
        }
    }

    private inner class ModuleTypeDefinitionBuilder : PLBaseVisitor<TypeDefinition?>() {

        override fun visitClassHeader(ctx: ClassHeaderContext): TypeDefinition? {
            val rawTypeParams: TypeParametersDeclarationContext? = ctx.typeParametersDeclaration()
            val rawTypeDeclaration = ctx.typeDeclaration()
            val typeParameters = rawTypeParams?.typeParameters ?: emptyList()
            val range = rawTypeParams?.range?.union(rawTypeDeclaration.range) ?: rawTypeDeclaration.range
            return rawTypeDeclaration.accept(TypeDefinitionBuilder(range, typeParameters)) ?: return null
        }

        override fun visitUtilClassHeader(ctx: UtilClassHeaderContext): TypeDefinition =
            TypeDefinition.ofDummy(range = ctx.range)

        private inner class TypeDefinitionBuilder(
            private val range: Range,
            private val typeParameters: List<String>
        ) : PLBaseVisitor<TypeDefinition?>() {

            override fun visitObjType(ctx: ObjTypeContext): TypeDefinition =
                TypeDefinition(
                    range = range,
                    type = TypeDefinitionType.OBJECT,
                    typeParameters = typeParameters,
                    mappings = ctx.objectTypeFieldDeclaration().asSequence().mapNotNull { c ->
                        val name = c.LowerId().symbol.text
                        val type = c.typeAnnotation().typeExpr().accept(TypeBuilder) ?: return@mapNotNull null
                        name to type
                    }.toMap()
                )

            override fun visitVariantType(ctx: VariantTypeContext): TypeDefinition =
                TypeDefinition(
                    range = range,
                    type = TypeDefinitionType.VARIANT,
                    typeParameters = typeParameters,
                    mappings = ctx.variantTypeConstructorDeclaration().asSequence().mapNotNull { c ->
                        val name = c.UpperId().symbol.text
                        val type = c.typeExpr().accept(TypeBuilder) ?: return@mapNotNull null
                        name to type
                    }.toMap()
                )
        }
    }

    private fun buildClassMemberDefinition(ctx: ClassMemberDefinitionContext): ClassDefinition.MemberDefinition? {
        val nameSymbol = ctx.LowerId().symbol
        val parameters = ctx.annotatedVariable().map { annotatedVariable ->
            val parameterNameSymbol = annotatedVariable.LowerId().symbol
            val typeExpression = annotatedVariable.typeAnnotation().typeExpr()
            ClassDefinition.MemberDefinition.Parameter(
                name = parameterNameSymbol.text,
                nameRange = parameterNameSymbol.range,
                type = typeExpression.accept(TypeBuilder) ?: return null,
                typeRange = typeExpression.range
            )
        }
        val type = Type.FunctionType(
            argumentTypes = parameters.map { it.type },
            returnType = ctx.typeExpr().accept(TypeBuilder) ?: return null
        )
        val body = ctx.expression().let { expressionContext ->
            expressionContext.accept(expressionBuilder) ?: ExpressionBuilder.dummyExpression(
                range = expressionContext.range
            )
        }
        return ClassDefinition.MemberDefinition(
            range = ctx.range,
            isPublic = ctx.PUBLIC() != null,
            isMethod = ctx.METHOD() != null,
            nameRange = nameSymbol.range,
            name = nameSymbol.text,
            typeParameters = ctx.typeParametersDeclaration()?.typeParameters ?: emptyList(),
            type = type,
            parameters = parameters,
            body = body
        )
    }

    override fun visitClazz(ctx: ClazzContext): ClassDefinition? {
        val (name, nameRange) = ctx.classHeaderDeclaration().accept(ModuleNameBuilder)
        return ClassDefinition(
            range = ctx.range,
            nameRange = nameRange,
            name = name,
            typeDefinition = ctx.classHeaderDeclaration().accept(ModuleTypeDefinitionBuilder()) ?: return null,
            members = ctx.classMemberDefinition().mapNotNull { buildClassMemberDefinition(ctx = it) }
        )
    }
}
