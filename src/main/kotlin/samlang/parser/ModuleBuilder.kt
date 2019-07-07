package samlang.parser

import samlang.ast.Expression
import samlang.ast.Module
import samlang.ast.Range
import samlang.ast.Type
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLParser.*

internal object ModuleBuilder : PLBaseVisitor<Module>() {

    private val TypeParametersDeclarationContext.typeParameters: List<String> get() = UpperId().map { it.symbol.text }

    private object ModuleNameBuilder : PLBaseVisitor<Range.WithName>() {

        override fun visitClassHeader(ctx: ClassHeaderContext): Range.WithName =
            ctx.UpperId().symbol.rangeWithName

        override fun visitUtilHeader(ctx: UtilHeaderContext): Range.WithName =
            ctx.UpperId().symbol.rangeWithName

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
        val annotatedVariables = ctx.annotatedVariable().map { annotatedVar ->
            val varName = annotatedVar.LowerId().symbol.rangeWithName
            val typeAnnotation = annotatedVar.typeAnnotation().typeExpr().accept(TypeBuilder)
            varName to typeAnnotation
        }
        val typeExpression = ctx.typeExpr()
        val bodyExpression = ctx.expression()
        val firstArgRange = annotatedVariables.firstOrNull()?.first?.range
        val type = Type.FunctionType(
            argumentTypes = annotatedVariables.map { it.second },
            returnType = typeExpression.accept(TypeBuilder)
        )
        return Module.MemberDefinition(
            range = ctx.range,
            isPublic = ctx.PUBLIC() != null,
            isMethod = ctx.METHOD() != null,
            name = ctx.LowerId().symbol.text,
            type = ctx.typeParametersDeclaration()?.typeParameters to type,
            value = Expression.Lambda(
                range = Range(
                    start = firstArgRange?.start ?: bodyExpression.range.start,
                    end = bodyExpression.range.end
                ),
                type = type,
                arguments = annotatedVariables.map { (nameWithRange, type) -> nameWithRange.name to type },
                body = bodyExpression.accept(ExpressionBuilder)
            )
        )
    }

    override fun visitModule(ctx: ModuleContext): Module {
        val (nameRange, name) = ctx.moduleHeaderDeclaration().accept(ModuleNameBuilder)
        return Module(
            range = ctx.range,
            nameRange = nameRange,
            name = name,
            typeDefinition = ctx.moduleHeaderDeclaration().accept(ModuleTypeDefinitionBuilder),
            members = ctx.moduleMemberDefinition().map { buildModuleMemberDefinition(ctx = it) }
        )
    }

}


