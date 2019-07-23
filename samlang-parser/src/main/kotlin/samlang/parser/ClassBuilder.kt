package samlang.parser

import samlang.ast.ClassDefinition
import samlang.ast.Range
import samlang.ast.Type
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLParser.ClassHeaderContext
import samlang.parser.generated.PLParser.ClassMemberDefinitionContext
import samlang.parser.generated.PLParser.ClazzContext
import samlang.parser.generated.PLParser.ObjTypeContext
import samlang.parser.generated.PLParser.TypeParametersDeclarationContext
import samlang.parser.generated.PLParser.UtilClassHeaderContext
import samlang.parser.generated.PLParser.VariantTypeContext

internal class ClassBuilder(syntaxErrorListener: SyntaxErrorListener) : PLBaseVisitor<ClassDefinition>() {

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

    private inner class ModuleTypeDefinitionBuilder : PLBaseVisitor<ClassDefinition.TypeDefinition>() {

        override fun visitClassHeader(ctx: ClassHeaderContext): ClassDefinition.TypeDefinition {
            val rawTypeParams: TypeParametersDeclarationContext? = ctx.typeParametersDeclaration()
            val rawTypeDeclaration = ctx.typeDeclaration()
            val typeParameters = rawTypeParams?.typeParameters
            val range = rawTypeParams?.range?.union(rawTypeDeclaration.range) ?: rawTypeDeclaration.range
            return rawTypeDeclaration.accept(TypeDefinitionBuilder(range, typeParameters))
        }

        override fun visitUtilClassHeader(ctx: UtilClassHeaderContext): ClassDefinition.TypeDefinition =
            ClassDefinition.TypeDefinition(
                range = ctx.range,
                type = ClassDefinition.TypeDefinitionType.OBJECT,
                typeParameters = emptyList(),
                mappings = emptyMap()
            )

        private inner class TypeDefinitionBuilder(
            private val range: Range,
            private val typeParameters: List<String>?
        ) : PLBaseVisitor<ClassDefinition.TypeDefinition>() {

            override fun visitObjType(ctx: ObjTypeContext): ClassDefinition.TypeDefinition =
                ClassDefinition.TypeDefinition(
                    range = range,
                    type = ClassDefinition.TypeDefinitionType.OBJECT,
                    typeParameters = typeParameters,
                    mappings = ctx.objectTypeFieldDeclaration().asSequence().map { c ->
                        val name = c.LowerId().symbol.text
                        val type = c.typeAnnotation().typeExpr().accept(TypeBuilder)
                        name to type
                    }.toMap()
                )

            override fun visitVariantType(ctx: VariantTypeContext): ClassDefinition.TypeDefinition =
                ClassDefinition.TypeDefinition(
                    range = range,
                    type = ClassDefinition.TypeDefinitionType.VARIANT,
                    typeParameters = typeParameters,
                    mappings = ctx.variantTypeConstructorDeclaration().asSequence().map { c ->
                        val name = c.UpperId().symbol.text
                        val type = c.typeExpr().accept(TypeBuilder)
                        name to type
                    }.toMap()
                )
        }
    }

    private fun buildClassMemberDefinition(ctx: ClassMemberDefinitionContext): ClassDefinition.MemberDefinition {
        val nameSymbol = ctx.LowerId().symbol
        val parameters = ctx.annotatedVariable().map { annotatedVariable ->
            val parameterNameSymbol = annotatedVariable.LowerId().symbol
            val typeExpression = annotatedVariable.typeAnnotation().typeExpr()
            ClassDefinition.MemberDefinition.Parameter(
                name = parameterNameSymbol.text,
                nameRange = parameterNameSymbol.range,
                type = typeExpression.accept(TypeBuilder),
                typeRange = typeExpression.range
            )
        }
        val type = Type.FunctionType(
            argumentTypes = parameters.map { it.type },
            returnType = ctx.typeExpr().accept(TypeBuilder)
        )
        return ClassDefinition.MemberDefinition(
            range = ctx.range,
            isPublic = ctx.PUBLIC() != null,
            isMethod = ctx.METHOD() != null,
            nameRange = nameSymbol.range,
            name = nameSymbol.text,
            typeParameters = ctx.typeParametersDeclaration()?.typeParameters,
            type = type,
            parameters = parameters,
            body = ctx.expression().accept(expressionBuilder)
        )
    }

    override fun visitClazz(ctx: ClazzContext): ClassDefinition {
        val (name, nameRange) = ctx.classHeaderDeclaration().accept(ModuleNameBuilder)
        return ClassDefinition(
            range = ctx.range,
            nameRange = nameRange,
            name = name,
            typeDefinition = ctx.classHeaderDeclaration().accept(ModuleTypeDefinitionBuilder()),
            members = ctx.classMemberDefinition().map { buildClassMemberDefinition(ctx = it) }
        )
    }
}
