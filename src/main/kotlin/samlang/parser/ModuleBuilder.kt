package samlang.parser

import samlang.ast.common.Position
import samlang.ast.raw.RawExpr
import samlang.ast.raw.RawModule
import samlang.ast.raw.RawTypeExpr
import samlang.ast.common.Position.Companion.position
import samlang.ast.common.Position.Companion.positionWithName
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLParser.*

internal object ModuleBuilder : PLBaseVisitor<RawModule>() {

    private val TypeParametersDeclarationContext.typeParameters: List<Position.WithName>
        get() = UpperId().map { it.symbol.positionWithName }

    private object ModuleNameBuilder : PLBaseVisitor<Position.WithName>() {

        override fun visitClassHeader(ctx: ClassHeaderContext): Position.WithName =
            ctx.UpperId().symbol.positionWithName

        override fun visitUtilHeader(ctx: UtilHeaderContext): Position.WithName =
            ctx.UpperId().symbol.positionWithName

    }

    private object ModuleTypeDefBuilder : PLBaseVisitor<RawModule.RawTypeDef?>() {

        override fun visitClassHeader(ctx: ClassHeaderContext): RawModule.RawTypeDef {
            val rawTypeParams: TypeParametersDeclarationContext? = ctx.typeParametersDeclaration()
            val rawTypeDeclaration = ctx.typeDeclaration()
            val typeParams = rawTypeParams?.typeParameters
            val position = rawTypeParams?.position?.union(rawTypeDeclaration.position) ?: rawTypeDeclaration.position
            return rawTypeDeclaration.accept(TypeDefBuilder(position, typeParams))
        }

        override fun visitUtilHeader(ctx: UtilHeaderContext): RawModule.RawTypeDef? = null

        private class TypeDefBuilder(
            private val position: Position,
            private val typeParams: List<Position.WithName>?
        ) : PLBaseVisitor<RawModule.RawTypeDef>() {

            override fun visitObjType(ctx: ObjTypeContext): RawModule.RawTypeDef =
                RawModule.RawTypeDef.ObjectType(
                    position = position,
                    typeParams = typeParams,
                    mappings = ctx.objectTypeFieldDeclaration().map { c ->
                        val (pos, name) = c.LowerId().symbol.positionWithName
                        val t = c.typeAnnotation().typeExpr().accept(TypeExprBuilder)
                        name to (pos to t)
                    }
                )

            override fun visitVariantType(ctx: VariantTypeContext): RawModule.RawTypeDef =
                RawModule.RawTypeDef.VariantType(
                    position = position,
                    typeParams = typeParams,
                    mappings = ctx.variantTypeConstructorDeclaration().map { c ->
                        val (pos, name) = c.UpperId().symbol.positionWithName
                        val t = c.typeExpr().accept(TypeExprBuilder)
                        name to (pos to t)
                    }
                )

        }

    }

    private fun buildModuleMemberDefinition(ctx: ModuleMemberDefinitionContext): RawModule.RawMemberDefinition {
        val annotatedVars = ctx.annotatedVariable().map { annotatedVar ->
            val varName = annotatedVar.LowerId().symbol.positionWithName
            val typeAnnotation = annotatedVar.typeAnnotation().typeExpr().accept(TypeExprBuilder)
            varName to typeAnnotation
        }
        val firstArgPos = annotatedVars.firstOrNull()?.first?.position
        return RawModule.RawMemberDefinition(
            position = ctx.position,
            isPublic = ctx.PUBLIC() != null,
            isMethod = ctx.METHOD() != null,
            typeParameters = ctx.typeParametersDeclaration()?.typeParameters,
            name = ctx.LowerId().symbol.positionWithName,
            typeAnnotation = RawTypeExpr.FunctionType(
                position = Position(
                    lineStart = firstArgPos?.lineStart ?: ctx.typeExpr().start.line,
                    lineEnd = ctx.typeExpr().stop.line,
                    colStart = firstArgPos?.colStart ?: ctx.typeExpr().start.startIndex,
                    colEnd = ctx.typeExpr().stop.stopIndex
                ),
                argumentTypes = annotatedVars.map { it.second },
                returnType = ctx.typeExpr().accept(TypeExprBuilder)
            ),
            value = RawExpr.Lambda(
                position = Position(
                    lineStart = firstArgPos?.lineStart ?: ctx.expression().start.line,
                    lineEnd = ctx.expression().stop.line,
                    colStart = firstArgPos?.colStart ?: ctx.expression().start.startIndex,
                    colEnd = ctx.expression().stop.stopIndex
                ),
                arguments = annotatedVars,
                body = ctx.expression().accept(ExprBuilder)
            )
        )
    }

    override fun visitModule(ctx: ModuleContext): RawModule = RawModule(
        position = ctx.position,
        name = ctx.moduleHeaderDeclaration().accept(ModuleNameBuilder),
        typeDef = ctx.moduleHeaderDeclaration().accept(ModuleTypeDefBuilder),
        members = ctx.moduleMemberDefinition().map { buildModuleMemberDefinition(ctx = it) }
    )

}


