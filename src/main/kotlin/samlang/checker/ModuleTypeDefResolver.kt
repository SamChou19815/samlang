package samlang.checker

import samlang.ast.checked.CheckedTypeExpr
import samlang.ast.checked.CheckedTypeExpr.*
import samlang.ast.checked.CheckedTypeExprVisitor
import samlang.errors.IllegalOtherClassMatch
import samlang.errors.TypeParamSizeMismatchError
import samlang.parser.Position

internal object ModuleTypeDefResolver {

    fun applyGenericTypeParams(type: CheckedTypeExpr, context: Map<String, CheckedTypeExpr>): CheckedTypeExpr =
        type.accept(visitor = Visitor, context = context)

    fun getTypeDef(
        identifierType: IdentifierType,
        ctx: TypeCheckingContext,
        errorPosition: Position,
        isFromObject: Boolean
    ): Map<String, CheckedTypeExpr> {
        val (id, typeArgs) = identifierType
        if (id != ctx.currentModule) {
            throw IllegalOtherClassMatch(position = errorPosition)
        }
        val (typeParams, varMap) = if (isFromObject) {
            val (p, m) = ctx.getCurrentModuleObjectTypeDef(errorPosition = errorPosition)
            p to m
        } else {
            val (p, m) = ctx.getCurrentModuleVariantTypeDef(errorPosition = errorPosition)
            p to m
        }
        return if (typeArgs == null) {
            if (typeParams != null) {
                error(message = "BAD! TypeArgs: null, typeParams: $typeParams, identifierType: $identifierType")
            }
            varMap
        } else {
            if (typeParams == null) {
                error(message = "BAD! TypeArgs: $typeArgs, typeParams: null, identifierType: $identifierType")
            }
            TypeParamSizeMismatchError.check(
                expectedSize = typeParams.size,
                actualSize = typeArgs.size,
                position = errorPosition
            )
            varMap.mapValues { (_, v) -> applyGenericTypeParams(type = v, context = typeParams.zip(typeArgs).toMap()) }
        }
    }

    private object Visitor : CheckedTypeExprVisitor<Map<String, CheckedTypeExpr>, CheckedTypeExpr> {

        override fun visit(typeExpr: UnitType, context: Map<String, CheckedTypeExpr>): CheckedTypeExpr = typeExpr
        override fun visit(typeExpr: IntType, context: Map<String, CheckedTypeExpr>): CheckedTypeExpr = typeExpr
        override fun visit(typeExpr: StringType, context: Map<String, CheckedTypeExpr>): CheckedTypeExpr = typeExpr
        override fun visit(typeExpr: BoolType, context: Map<String, CheckedTypeExpr>): CheckedTypeExpr = typeExpr

        override fun visit(typeExpr: IdentifierType, context: Map<String, CheckedTypeExpr>): CheckedTypeExpr {
            if (typeExpr.typeArgs != null) {
                val newTypeArgs = typeExpr.typeArgs.map { applyGenericTypeParams(type = it, context = context) }
                return typeExpr.copy(typeArgs = newTypeArgs)
            }
            val replacement = context[typeExpr.identifier]
            if (replacement != null) {
                return replacement
            }
            return typeExpr
        }

        override fun visit(typeExpr: TupleType, context: Map<String, CheckedTypeExpr>): CheckedTypeExpr =
            TupleType(mappings = typeExpr.mappings.map { applyGenericTypeParams(type = it, context = context) })

        override fun visit(typeExpr: FunctionType, context: Map<String, CheckedTypeExpr>): CheckedTypeExpr =
            FunctionType(
                argumentTypes = typeExpr.argumentTypes.map { applyGenericTypeParams(type = it, context = context) },
                returnType = applyGenericTypeParams(type = typeExpr.returnType, context = context)
            )

        override fun visit(typeExpr: UndecidedType, context: Map<String, CheckedTypeExpr>): CheckedTypeExpr = typeExpr

        override fun visit(typeExpr: FreeType, context: Map<String, CheckedTypeExpr>): CheckedTypeExpr =
            error(message = "You are not supposed to apply generic type arguments on a free type.")

    }
}
