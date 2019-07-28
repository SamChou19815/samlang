package samlang.ast.ts

import samlang.ast.common.Type

sealed class TsStatement {

    data class Throw(val expression: TsExpression) : TsStatement()

    data class IfElse(val booleanExpression: TsExpression, val s1: List<TsStatement>, val s2: List<TsStatement>) :
        TsStatement()

    data class Match(
        val assignedTemporaryVariable: String?,
        val matchedExpression: TsExpression,
        val matchingList: List<VariantPatternToStatement>
    ) :
        TsStatement() {
        data class VariantPatternToStatement(
            val tag: String,
            val dataVariable: String?,
            val statements: List<TsStatement>,
            val finalExpression: TsExpression
        )
    }

    data class LetDeclaration(val name: String, val typeAnnotation: Type) : TsStatement()

    data class VariableAssignment(val name: String, val assignedExpression: TsExpression) : TsStatement()

    data class ConstantDefinition(
        val pattern: TsPattern,
        val typeAnnotation: Type,
        val assignedExpression: TsExpression
    ) : TsStatement()

    data class Return(val expression: TsExpression?) : TsStatement()
}
