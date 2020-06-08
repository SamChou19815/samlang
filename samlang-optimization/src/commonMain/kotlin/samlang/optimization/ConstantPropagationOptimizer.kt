package samlang.optimization

import samlang.analysis.ConstantPropagationAnalysis
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
internal class ConstantPropagationOptimizer private constructor(
    statements: List<MidIrStatement>,
    analysisResult: ConstantPropagationAnalysis
) {
    /** The in set of the analysis. */
    private val `in`: Array<MutableMap<String, Long>> = analysisResult.constantsIn
    /** A sequence of new statements. */
    private val newStatements: MutableList<MidIrStatement> = mutableListOf()

    init {
        val visitor = StatementRewriterVisitor()
        statements.forEachIndexed { index, statement -> statement.accept(visitor, index) }
    }

    private inner class StatementRewriterVisitor : MidIrLoweredStatementVisitor<Int, Unit> {
        private val expressionRewriter: ExpressionRewriter = ExpressionRewriter()

        private fun rewrite(expression: MidIrExpression, id: Int): MidIrExpression =
            ConstantFolder.fold(expression.accept(expressionRewriter, id))

        override fun visit(node: MoveTemp, context: Int) {
            val dest = node.tempId
            val newSource = rewrite(node.source, context)
            if (newSource is Temporary && dest == newSource.id) {
                // mov a, a is new optimized away.
                return
            }
            newStatements += MoveTemp(tempId = dest, source = newSource)
        }

        override fun visit(node: MoveMem, context: Int) {
            newStatements += MoveMem(
                memLocation = rewrite(expression = node.memLocation, id = context),
                source = rewrite(expression = node.source, id = context)
            )
        }

        override fun visit(node: CallFunction, context: Int) {
            newStatements += CallFunction(
                functionExpr = rewrite(node.functionExpr, context),
                arguments = node.arguments.map { rewrite(it, context) },
                returnCollector = node.returnCollector
            )
        }

        override fun visit(node: Jump, context: Int) {
            newStatements += node
        }

        override fun visit(node: ConditionalJumpFallThrough, context: Int) {
            val condition = rewrite(node.condition, context)
            if (condition is Constant) {
                val value = condition.value
                if (value == 0L) {
                    // directly fall through
                    return
                } else if (value == 1L) {
                    newStatements += Jump(label = node.label1)
                    return
                }
            }
            newStatements += ConditionalJumpFallThrough(condition = condition, label1 = node.label1)
        }

        override fun visit(node: Label, context: Int) {
            newStatements += node
        }

        override fun visit(node: Return, context: Int) {
            newStatements += Return(returnedExpression = node.returnedExpression?.let { rewrite(it, context) })
        }

        private inner class ExpressionRewriter : MidIrLoweredExpressionVisitor<Int, MidIrExpression> {
            override fun visit(node: Constant, context: Int): MidIrExpression = node
            override fun visit(node: Name, context: Int): MidIrExpression = node

            override fun visit(node: Temporary, context: Int): MidIrExpression {
                val newId = `in`[context][node.id] ?: return node
                return Constant(value = newId)
            }

            override fun visit(node: Op, context: Int): MidIrExpression = Op(
                operator = node.operator,
                e1 = rewrite(node.e1, context),
                e2 = rewrite(node.e2, context)
            )

            override fun visit(node: Mem, context: Int): MidIrExpression =
                node.copy(expression = rewrite(node.expression, context))
        }
    }

    companion object {
        fun optimize(statements: List<MidIrStatement>): List<MidIrStatement> {
            val analysis = ConstantPropagationAnalysis(statements = statements)
            return ConstantPropagationOptimizer(statements = statements, analysisResult = analysis).newStatements
        }
    }
}
