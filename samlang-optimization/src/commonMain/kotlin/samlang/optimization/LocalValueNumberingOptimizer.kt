package samlang.optimization

import samlang.analysis.LocalValueNumberingAnalysis
import samlang.analysis.LocalValueNumberingAnalysis.NumberingInfo
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Constant
import samlang.ast.mir.MidIrExpression.Mem
import samlang.ast.mir.MidIrExpression.Name
import samlang.ast.mir.MidIrExpression.Op
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrLoweredExpressionVisitor
import samlang.ast.mir.MidIrLoweredStatementVisitor
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.CallFunction
import samlang.ast.mir.MidIrStatement.ConditionalJumpFallThrough
import samlang.ast.mir.MidIrStatement.Jump
import samlang.ast.mir.MidIrStatement.Label
import samlang.ast.mir.MidIrStatement.MoveMem
import samlang.ast.mir.MidIrStatement.MoveTemp
import samlang.ast.mir.MidIrStatement.Return

@ExperimentalStdlibApi
object LocalValueNumberingOptimizer {
    fun optimize(statements: List<MidIrStatement>): List<MidIrStatement> {
        val infoList = LocalValueNumberingAnalysis(statements).numberingInfoListIn
        return statements.mapIndexed { i, statement ->
            val numberingInfo = infoList[i] ?: error(message = "Missing information for $statement")
            statement.accept(visitor = StatementRewriterVisitor, context = numberingInfo)
        }
    }

    private fun rewrite(expr: MidIrExpression, info: NumberingInfo): MidIrExpression =
        info.replaceWithTemp(expr) ?: expr.accept(ExpressionRewriterVisitor, info)

    private object StatementRewriterVisitor :
        MidIrLoweredStatementVisitor<NumberingInfo, MidIrStatement> {
        override fun visit(node: MoveTemp, context: NumberingInfo): MidIrStatement =
            MoveTemp(node.tempId, rewrite(node.source, context))

        override fun visit(node: MoveMem, context: NumberingInfo): MidIrStatement = MoveMem(
            memLocation = rewrite(node.memLocation, context),
            source = rewrite(node.source, context)
        )

        override fun visit(node: CallFunction, context: NumberingInfo): MidIrStatement =
            CallFunction(
                functionExpr = rewrite(node.functionExpr, context),
                arguments = node.arguments.map { rewrite(it, context) },
                returnCollector = node.returnCollector
            )

        override fun visit(node: Jump, context: NumberingInfo): MidIrStatement = node

        override fun visit(node: ConditionalJumpFallThrough, context: NumberingInfo): MidIrStatement =
            ConditionalJumpFallThrough(
                condition = rewrite(expr = node.condition, info = context),
                label1 = node.label1
            )

        override fun visit(node: Label, context: NumberingInfo): MidIrStatement = node

        override fun visit(node: Return, context: NumberingInfo): MidIrStatement =
            Return(returnedExpression = node.returnedExpression?.let { rewrite(it, context) })
    }

    /** The visitor is only called when the given node cannot find a direct replacement. */
    private object ExpressionRewriterVisitor : MidIrLoweredExpressionVisitor<NumberingInfo, MidIrExpression> {
        override fun visit(node: Constant, context: NumberingInfo): Constant = node
        override fun visit(node: Name, context: NumberingInfo): Name = node
        override fun visit(node: Temporary, context: NumberingInfo): Temporary = node

        override fun visit(node: Op, context: NumberingInfo): Op {
            return Op(node.operator, rewrite(node.e1, context), rewrite(node.e2, context))
        }

        override fun visit(node: Mem, context: NumberingInfo): Mem = Mem(rewrite(node.expression, context))
    }
}
