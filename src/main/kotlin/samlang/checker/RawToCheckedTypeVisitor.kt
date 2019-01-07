package samlang.checker

import samlang.ast.checked.CheckedTypeExpr
import samlang.ast.raw.RawTypeExpr
import samlang.ast.raw.RawTypeExpr.*
import samlang.ast.raw.RawTypeExprVisitor

internal object RawToCheckedTypeVisitor : RawTypeExprVisitor<TypeCheckingContext, CheckedTypeExpr> {

    override fun visit(typeExpr: UnitType, context: TypeCheckingContext): CheckedTypeExpr =
        CheckedTypeExpr.UnitType

    override fun visit(typeExpr: IntType, context: TypeCheckingContext): CheckedTypeExpr =
        CheckedTypeExpr.IntType

    override fun visit(typeExpr: StringType, context: TypeCheckingContext): CheckedTypeExpr =
        CheckedTypeExpr.StringType

    override fun visit(typeExpr: BoolType, context: TypeCheckingContext): CheckedTypeExpr =
        CheckedTypeExpr.BoolType

    private fun RawTypeExpr.toChecked(context: TypeCheckingContext): CheckedTypeExpr =
        accept(visitor = RawToCheckedTypeVisitor, context = context)

    override fun visit(typeExpr: RawTypeExpr.IdentifierType, context: TypeCheckingContext): CheckedTypeExpr {
        val (_, identifierWithPos, typeArgs) = typeExpr
        val (identifierPosition, name) = identifierWithPos
        context.checkIfIdentifierTypeIsWellDefined(
            name = name,
            typeArgLength = typeArgs?.size ?: 0,
            errorPosition = identifierPosition
        )
        return CheckedTypeExpr.IdentifierType(
            identifier = name,
            typeArgs = typeArgs?.map { it.toChecked(context = context) }
        )
    }

    override fun visit(typeExpr: TupleType, context: TypeCheckingContext): CheckedTypeExpr =
        CheckedTypeExpr.TupleType(typeExpr.mappings.map { it.toChecked(context = context) })

    override fun visit(typeExpr: FunctionType, context: TypeCheckingContext): CheckedTypeExpr =
        CheckedTypeExpr.FunctionType(
            argumentTypes = typeExpr.argumentTypes.map { it.toChecked(context = context) },
            returnType = typeExpr.returnType.toChecked(context = context)
        )

}