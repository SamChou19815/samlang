package samlang.ast.ir

import samlang.ast.common.Type
import samlang.ast.ts.TsPattern

/**
 * A collection of statements for common IR.
 */
sealed class IrStatement {

    data class Throw(val expression: IrExpression) : IrStatement()

    data class IfElse(val booleanExpression: IrExpression, val s1: List<IrStatement>, val s2: List<IrStatement>) :
        IrStatement()

    data class Match(
        val assignedTemporaryVariable: String?,
        val matchedExpression: IrExpression,
        val matchingList: List<VariantPatternToStatement>
    ) : IrStatement() {
        data class VariantPatternToStatement(
            val tag: String,
            val dataVariable: String?,
            val statements: List<IrStatement>,
            val finalExpression: IrExpression
        )
    }

    data class LetDeclaration(val name: String, val typeAnnotation: Type) : IrStatement()

    data class VariableAssignment(val name: String, val assignedExpression: IrExpression) : IrStatement()

    data class ConstantDefinition(
        val pattern: TsPattern,
        val typeAnnotation: Type,
        val assignedExpression: IrExpression
    ) : IrStatement()

    data class Return(val expression: IrExpression?) : IrStatement()
}
