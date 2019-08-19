package samlang.ast.ir

import samlang.ast.common.Type
import samlang.ast.ts.TsPattern

/**
 * A collection of statements for common IR.
 */
sealed class IrStatement {

    abstract fun <T> accept(visitor: IrStatementVisitor<T>): T

    data class Throw(val expression: IrExpression) : IrStatement() {
        override fun <T> accept(visitor: IrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class IfElse(
        val booleanExpression: IrExpression,
        val s1: List<IrStatement>,
        val s2: List<IrStatement>
    ) : IrStatement() {
        override fun <T> accept(visitor: IrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class Match(
        val type: Type,
        val assignedTemporaryVariable: String?,
        val variableForMatchedExpression: String,
        val variableForMatchedExpressionType: Type.IdentifierType,
        val matchingList: List<VariantPatternToStatement>
    ) : IrStatement() {

        data class VariantPatternToStatement(
            val tag: String,
            val dataVariable: String?,
            val statements: List<IrStatement>,
            val finalExpression: IrExpression
        )

        override fun <T> accept(visitor: IrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class LetDeclaration(val name: String, val typeAnnotation: Type) : IrStatement() {
        override fun <T> accept(visitor: IrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class VariableAssignment(val name: String, val assignedExpression: IrExpression) : IrStatement() {
        override fun <T> accept(visitor: IrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class ConstantDefinition(
        val pattern: TsPattern,
        val typeAnnotation: Type,
        val assignedExpression: IrExpression
    ) : IrStatement() {
        override fun <T> accept(visitor: IrStatementVisitor<T>): T = visitor.visit(statement = this)
    }

    data class Return(val expression: IrExpression?) : IrStatement() {
        override fun <T> accept(visitor: IrStatementVisitor<T>): T = visitor.visit(statement = this)
    }
}
