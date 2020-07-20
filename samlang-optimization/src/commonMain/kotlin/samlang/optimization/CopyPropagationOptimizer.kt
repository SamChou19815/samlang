package samlang.optimization

import kotlinx.collections.immutable.PersistentSet
import samlang.analysis.AvailableCopyAnalysis
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Constant
import samlang.ast.mir.MidIrExpression.Mem
import samlang.ast.mir.MidIrExpression.Name
import samlang.ast.mir.MidIrExpression.Op
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrExpressionVisitor
import samlang.ast.mir.MidIrLoweredStatementVisitor
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.CallFunction
import samlang.ast.mir.MidIrStatement.ConditionalJumpFallThrough
import samlang.ast.mir.MidIrStatement.MoveMem
import samlang.ast.mir.MidIrStatement.MoveTemp
import samlang.ast.mir.MidIrStatement.Return

@ExperimentalStdlibApi
internal class CopyPropagationOptimizer private constructor(
    statements: List<MidIrStatement>,
    analysisResult: AvailableCopyAnalysis
) {
    /** The in set of the analysis. */
    private val `in`: Array<PersistentSet<AvailableCopyAnalysis.Copy>> = analysisResult.copiesIn
    private val newStatements: MutableList<MidIrStatement> = mutableListOf()

    init {
        val visitor = StatementRewriterVisitor()
        statements.forEachIndexed { index, statement ->
            visitor.setId(id = index)
            statement.accept(visitor, Unit)
        }
    }

    private inner class StatementRewriterVisitor : MidIrLoweredStatementVisitor<Unit, Unit> {
        private val replacements: MutableMap<String, String> = mutableMapOf()
        private val expressionRewriter: ExpressionRewriter = ExpressionRewriter()

        fun setId(id: Int) {
            replacements.clear()
            val tempMapping = mutableMapOf<String, String?>()
            val availableCopies = `in`[id]
            // You cannot have one key mapped to two possible locations at a given point,
            // however, we may never remove those impossible mappings at the end, so they
            // appear here, we simply ignore them by storing them in invalidKeys.
            val invalidKeys = mutableSetOf<String>()
            for ((dest, src) in availableCopies) {
                if (tempMapping.containsKey(dest)) {
                    invalidKeys.add(dest)
                    continue
                }
                tempMapping[dest] = src
            }
            tempMapping.keys.removeAll(invalidKeys)
            for (key in tempMapping.keys) {
                var v = key
                while (true) {
                    val newV = tempMapping[v] ?: break
                    if (newV == v) {
                        break
                    }
                    v = newV
                }
                replacements[key] = v
            }
        }

        fun rewrite(expression: MidIrExpression): MidIrExpression = expression.accept(expressionRewriter, Unit)

        override fun visit(node: MoveTemp, context: Unit) {
            val dest = node.tempId
            val newSource = rewrite(expression = node.source)
            if (newSource is Temporary && dest == newSource.id) {
                // mov a, a is new optimized away.
                return
            }
            newStatements += MoveTemp(tempId = dest, source = newSource)
            return
        }

        override fun visit(node: MoveMem, context: Unit) {
            newStatements += node.copy(rewrite(node.memLocation), rewrite(node.source))
        }

        override fun visit(node: CallFunction, context: Unit) {
            newStatements += CallFunction(
                functionExpr = rewrite(expression = node.functionExpr),
                arguments = node.arguments.map { rewrite(expression = it) },
                returnCollector = node.returnCollector
            )
        }

        override fun visit(node: MidIrStatement.Jump, context: Unit) {
            newStatements += node
        }

        override fun visit(node: ConditionalJumpFallThrough, context: Unit) {
            newStatements += ConditionalJumpFallThrough(rewrite(node.condition), node.label1)
        }

        override fun visit(node: MidIrStatement.Label, context: Unit) {
            newStatements += node
        }

        override fun visit(node: Return, context: Unit) {
            newStatements += Return(node.returnedExpression?.let { rewrite(expression = it) })
        }

        private inner class ExpressionRewriter : MidIrExpressionVisitor<Unit, MidIrExpression> {
            override fun visit(node: Constant, context: Unit): MidIrExpression = node
            override fun visit(node: Name, context: Unit): MidIrExpression = node

            override fun visit(node: Temporary, context: Unit): MidIrExpression {
                val newId = replacements[node.id] ?: return node
                return Temporary(id = newId)
            }

            override fun visit(node: Op, context: Unit): MidIrExpression =
                Op(node.operator, rewrite(node.e1), rewrite(node.e2))

            override fun visit(node: Mem, context: Unit): MidIrExpression =
                node.copy(expression = rewrite(node.expression))
        }
    }

    companion object {
        fun optimize(statements: List<MidIrStatement>): List<MidIrStatement> =
            CopyPropagationOptimizer(
                statements = statements,
                analysisResult = AvailableCopyAnalysis(statements = statements)
            ).newStatements
    }
}
