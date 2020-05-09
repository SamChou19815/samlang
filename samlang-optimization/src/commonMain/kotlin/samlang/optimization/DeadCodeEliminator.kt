package samlang.optimization

import samlang.analysis.LiveTempAnalysis
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrLoweredExpressionVisitor
import samlang.ast.mir.MidIrOperator
import samlang.ast.mir.MidIrStatement

@ExperimentalStdlibApi
internal object DeadCodeEliminator {
    /**
     * @param statements the statements to optimize.
     * @return the optimized statements.
     */
    fun optimizeIr(statements: List<MidIrStatement>): List<MidIrStatement> {
        val liveTempOut = LiveTempAnalysis(statements = statements).liveTempOut
        val len = statements.size
        val newStatements = mutableListOf<MidIrStatement>()
        for (i in 0 until len) {
            val statement = statements[i]
            if (statement is MidIrStatement.MoveTemp) {
                val (dest, source) = statement
                if (dest !in liveTempOut[i] && source.accept(SafeRemovalVisitor, Unit)) {
                    // check source does not trigger potential exception.
                    continue
                }
            }
            newStatements.add(statement)
        }
        return newStatements
    }

    private object SafeRemovalVisitor : MidIrLoweredExpressionVisitor<Unit, Boolean> {
        override fun visit(node: MidIrExpression.Constant, context: Unit): Boolean = true
        override fun visit(node: MidIrExpression.Name, context: Unit): Boolean = true
        override fun visit(node: MidIrExpression.Temporary, context: Unit): Boolean = true

        override fun visit(node: MidIrExpression.Op, context: Unit): Boolean {
            when (node.operator) {
                MidIrOperator.DIV, MidIrOperator.MOD -> return false // they might cause exception
                else -> Unit
            }
            return node.e1.accept(visitor = this, context = Unit) && node.e2.accept(visitor = this, context = Unit)
        }

        override fun visit(node: MidIrExpression.Mem, context: Unit): Boolean =
            node.expression.accept(visitor = this, context = Unit)
    }
}
