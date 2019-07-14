package samlang.parser

import samlang.ast.Module
import samlang.ast.Range
import samlang.ast.Type
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLParser.ClassHeaderContext
import samlang.parser.generated.PLParser.ModuleContext
import samlang.parser.generated.PLParser.ModuleMemberDefinitionContext
import samlang.parser.generated.PLParser.ObjTypeContext
import samlang.parser.generated.PLParser.TypeParametersDeclarationContext
import samlang.parser.generated.PLParser.UtilHeaderContext
import samlang.parser.generated.PLParser.VariantTypeContext

internal object ModuleBuilder : PLBaseVisitor<Module>() {

    private val TypeParametersDeclarationContext.typeParameters: List<String> get() = UpperId().map { it.symbol.text }

    private object ModuleNameBuilder : PLBaseVisitor<Pair<String, Range>>() {

        override fun visitClassHeader(ctx: ClassHeaderContext): Pair<String, Range> {
            val symbol = ctx.UpperId().symbol
            return symbol.text to symbol.range
        }

        override fun visitUtilHeader(ctx: UtilHeaderContext): Pair<String, Range> {
            val symbol = ctx.UpperId().symbol
            return symbol.text to symbol.range
        }
    }

    private object ModuleTypeDefinitionBuilder : PLBaseVisitor<Module.TypeDefinition?>() {

        override fun visitClassHeader(ctx: ClassHeaderContext): Module.TypeDefinition {
            val rawTypeParams: TypeParametersDeclarationContext? = ctx.typeParametersDeclaration()
            val rawTypeDeclaration = ctx.typeDeclaration()
            val typeParams = rawTypeParams?.typeParameters
            val position = rawTypeParams?.range?.union(rawTypeDeclaration.range) ?: rawTypeDeclaration.range
            return rawTypeDeclaration.accept(TypeDefinitionBuilder(position, typeParams))
        }

        override fun visitUtilHeader(ctx: UtilHeaderContext): Module.TypeDefinition? = null

        private class TypeDefinitionBuilder(
            private val range: Range,
            private val typeParameters: List<String>?
        ) : PLBaseVisitor<Module.TypeDefinition>() {

            override fun visitObjType(ctx: ObjTypeContext): Module.TypeDefinition =
                Module.TypeDefinition.ObjectType(
                    range = range,
                    typeParameters = typeParameters,
                    mappings = ctx.objectTypeFieldDeclaration().asSequence().map { c ->
                        val name = c.LowerId().symbol.text
                        val type = c.typeAnnotation().typeExpr().accept(TypeBuilder)
                        name to type
                    }.toMap()
                )

            override fun visitVariantType(ctx: VariantTypeContext): Module.TypeDefinition =
                Module.TypeDefinition.VariantType(
                    range = range,
                    typeParameters = typeParameters,
                    mappings = ctx.variantTypeConstructorDeclaration().asSequence().map { c ->
                        val name = c.UpperId().symbol.text
                        val type = c.typeExpr().accept(TypeBuilder)
                        name to type
                    }.toMap()
                )
        }
    }

    private fun buildModuleMemberDefinition(ctx: ModuleMemberDefinitionContext): Module.MemberDefinition {
        val nameSymbol = ctx.LowerId().symbol
        val parameters = ctx.annotatedVariable().map { annotatedVariable ->
            val parameterNameSymbol = annotatedVariable.LowerId().symbol
            val typeExpression = annotatedVariable.typeAnnotation().typeExpr()
            Module.MemberDefinition.Parameter(
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
        return Module.MemberDefinition(
            range = ctx.range,
            isPublic = ctx.PUBLIC() != null,
            isMethod = ctx.METHOD() != null,
            nameRange = nameSymbol.range,
            name = nameSymbol.text,
            typeParameters = ctx.typeParametersDeclaration()?.typeParameters,
            type = type,
            parameters = parameters,
            body = ctx.expression().accept(ExpressionBuilder)
        )
    }

    override fun visitModule(ctx: ModuleContext): Module {
        val (name, nameRange) = ctx.moduleHeaderDeclaration().accept(ModuleNameBuilder)
        return Module(
            range = ctx.range,
            nameRange = nameRange,
            name = name,
            typeDefinition = ctx.moduleHeaderDeclaration().accept(ModuleTypeDefinitionBuilder),
            members = ctx.moduleMemberDefinition().map { buildModuleMemberDefinition(ctx = it) }
        )
    }
}
