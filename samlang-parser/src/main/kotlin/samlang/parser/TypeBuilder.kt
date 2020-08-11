package samlang.parser

import samlang.ast.common.Type
import samlang.ast.common.Type.Companion.bool
import samlang.ast.common.Type.Companion.id
import samlang.ast.common.Type.Companion.int
import samlang.ast.common.Type.Companion.string
import samlang.ast.common.Type.Companion.unit
import samlang.parser.generated.PLBaseVisitor
import samlang.parser.generated.PLParser

internal object TypeBuilder : PLBaseVisitor<Type?>() {

    override fun visitUnitType(ctx: PLParser.UnitTypeContext): Type = unit
    override fun visitBoolType(ctx: PLParser.BoolTypeContext): Type = bool
    override fun visitIntType(ctx: PLParser.IntTypeContext): Type = int
    override fun visitStrType(ctx: PLParser.StrTypeContext): Type = string

    override fun visitSingleIdentifierType(ctx: PLParser.SingleIdentifierTypeContext): Type? {
        val identifier = ctx.UpperId().symbol.text
        val typeParametersContext = ctx.typeParameters() ?: return id(identifier = identifier)
        val typeArguments = typeParametersContext.typeExpr().map { it.accept(TypeBuilder) ?: return null }
        return id(identifier = identifier, typeArguments = typeArguments)
    }

    override fun visitTupleType(ctx: PLParser.TupleTypeContext): Type? {
        val mappings = ctx.typeExpr().map { it.accept(TypeBuilder) ?: return null }
        return Type.TupleType(mappings = mappings)
    }

    override fun visitFunctionType(ctx: PLParser.FunctionTypeContext): Type? {
        val types = ctx.typeExpr()
        val argumentTypes = types.subList(fromIndex = 0, toIndex = types.size - 1).map {
            it.accept(TypeBuilder) ?: return null
        }
        val returnType = types.last().accept(TypeBuilder) ?: return null
        return Type.FunctionType(argumentTypes = argumentTypes, returnType = returnType)
    }

    override fun visitFunctionTypeNoArg(ctx: PLParser.FunctionTypeNoArgContext): Type? {
        val returnType = ctx.typeExpr()?.accept(TypeBuilder) ?: return null
        return Type.FunctionType(argumentTypes = emptyList(), returnType = returnType)
    }
}
