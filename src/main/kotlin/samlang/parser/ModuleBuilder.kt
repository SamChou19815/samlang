package samlang.parser

import samlang.ast.common.Range
import samlang.ast.raw.RawExpr
import samlang.ast.raw.RawModule
import samlang.ast.raw.RawTypeExpr
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLParser.*

internal object ModuleBuilder : PLBaseVisitor<RawModule>() {

    private val TypeParametersDeclarationContext.typeParameters: List<Range.WithName>
        get() = UpperId().map { it.symbol.rangeWithName }

    private object ModuleNameBuilder : PLBaseVisitor<Range.WithName>() {

        override fun visitClassHeader(ctx: ClassHeaderContext): Range.WithName =
            ctx.UpperId().symbol.rangeWithName

        override fun visitUtilHeader(ctx: UtilHeaderContext): Range.WithName =
            ctx.UpperId().symbol.rangeWithName

    }

    private object ModuleTypeDefBuilder : PLBaseVisitor<RawModule.RawTypeDef?>() {

        override fun visitClassHeader(ctx: ClassHeaderContext): RawModule.RawTypeDef {
            val rawTypeParams: TypeParametersDeclarationContext? = ctx.typeParametersDeclaration()
            val rawTypeDeclaration = ctx.typeDeclaration()
            val typeParams = rawTypeParams?.typeParameters
            val position = rawTypeParams?.range?.union(rawTypeDeclaration.range) ?: rawTypeDeclaration.range
            return rawTypeDeclaration.accept(TypeDefBuilder(position, typeParams))
        }

        override fun visitUtilHeader(ctx: UtilHeaderContext): RawModule.RawTypeDef? = null

        private class TypeDefBuilder(
            private val range: Range,
            private val typeParams: List<Range.WithName>?
        ) : PLBaseVisitor<RawModule.RawTypeDef>() {

            override fun visitObjType(ctx: ObjTypeContext): RawModule.RawTypeDef =
                RawModule.RawTypeDef.ObjectType(
                    range = range,
                    typeParams = typeParams,
                    mappings = ctx.objectTypeFieldDeclaration().map { c ->
                        val (pos, name) = c.LowerId().symbol.rangeWithName
                        val t = c.typeAnnotation().typeExpr().accept(TypeExprBuilder)
                        name to (pos to t)
                    }
                )

            override fun visitVariantType(ctx: VariantTypeContext): RawModule.RawTypeDef =
                RawModule.RawTypeDef.VariantType(
                    range = range,
                    typeParams = typeParams,
                    mappings = ctx.variantTypeConstructorDeclaration().map { c ->
                        val (pos, name) = c.UpperId().symbol.rangeWithName
                        val t = c.typeExpr().accept(TypeExprBuilder)
                        name to (pos to t)
                    }
                )

        }

    }

    private fun buildModuleMemberDefinition(ctx: ModuleMemberDefinitionContext): RawModule.RawMemberDefinition {
        val annotatedVariables = ctx.annotatedVariable().map { annotatedVar ->
            val varName = annotatedVar.LowerId().symbol.rangeWithName
            val typeAnnotation = annotatedVar.typeAnnotation().typeExpr().accept(TypeExprBuilder)
            varName to typeAnnotation
        }
        val typeExpression = ctx.typeExpr()
        val bodyExpression = ctx.expression()
        val firstArgRange = annotatedVariables.firstOrNull()?.first?.range
        return RawModule.RawMemberDefinition(
            range = ctx.range,
            isPublic = ctx.PUBLIC() != null,
            isMethod = ctx.METHOD() != null,
            typeParameters = ctx.typeParametersDeclaration()?.typeParameters,
            name = ctx.LowerId().symbol.rangeWithName,
            typeAnnotation = RawTypeExpr.FunctionType(
                range = Range(
                    start = firstArgRange?.start ?: typeExpression.range.start,
                    end = typeExpression.range.end
                ),
                argumentTypes = annotatedVariables.map { it.second },
                returnType = typeExpression.accept(TypeExprBuilder)
            ),
            value = RawExpr.Lambda(
                range = Range(
                    start = firstArgRange?.start ?: bodyExpression.range.start,
                    end = bodyExpression.range.end
                ),
                arguments = annotatedVariables,
                body = bodyExpression.accept(ExprBuilder)
            )
        )
    }

    override fun visitModule(ctx: ModuleContext): RawModule = RawModule(
        range = ctx.range,
        name = ctx.moduleHeaderDeclaration().accept(ModuleNameBuilder),
        typeDef = ctx.moduleHeaderDeclaration().accept(ModuleTypeDefBuilder),
        members = ctx.moduleMemberDefinition().map { buildModuleMemberDefinition(ctx = it) }
    )

}


