package samlang.analysis

import java.util.ArrayDeque
import java.util.Queue
import samlang.ast.mir.MidIrCompilationUnit
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrFunction
import samlang.ast.mir.MidIrLoweredExpressionVisitor
import samlang.ast.mir.MidIrLoweredStatementVisitor
import samlang.ast.mir.MidIrNameEncoder
import samlang.ast.mir.MidIrStatement

/** Find all actually called functions to help perform dead function elimination. */
object UsedFunctionAnalysis {
    @JvmStatic
    fun getUsedFunctions(irCompilationUnit: MidIrCompilationUnit): Set<String> {
        val used = mutableSetOf<String>()
        val (_, functions) = irCompilationUnit
        val usedFunctionMap = functions.map { it.functionName to getOtherFunctionsUsedBy(function = it) }.toMap()
        val queue: Queue<String> = ArrayDeque()
        queue += MidIrNameEncoder.compiledProgramMain
        while (queue.isNotEmpty()) {
            val functionName = queue.poll()
            val usedByThisFunction = usedFunctionMap[functionName] ?: continue
            usedByThisFunction.forEach { usedFunction ->
                if (usedFunction !in used) {
                    used += usedFunction
                    queue += usedFunction
                }
            }
        }
        return used
    }

    private fun getOtherFunctionsUsedBy(function: MidIrFunction): Set<String> {
        val collector = MentionedFunctionCollector()
        function.mainBodyStatements.forEach { it.accept(visitor = collector, context = Unit) }
        val mentioned = collector.mentioned
        mentioned.remove(element = function.functionName)
        return mentioned
    }

    private class MentionedFunctionCollector : MidIrLoweredStatementVisitor<Unit, Unit> {
        val mentioned: MutableSet<String> = mutableSetOf()
        private val expressionVisitor: ExpressionVisitor = ExpressionVisitor()

        private fun add(name: String) {
            mentioned += name
        }

        private fun addExpression(expression: MidIrExpression): Unit =
            expression.accept(visitor = expressionVisitor, context = Unit)

        override fun visit(node: MidIrStatement.MoveTemp, context: Unit): Unit = addExpression(expression = node.source)

        override fun visit(node: MidIrStatement.MoveMem, context: Unit) {
            addExpression(expression = node.memLocation)
            addExpression(expression = node.source)
        }

        override fun visit(node: MidIrStatement.CallFunction, context: Unit) {
            addExpression(expression = node.functionExpr)
            node.arguments.forEach { addExpression(expression = it) }
        }

        override fun visit(node: MidIrStatement.Jump, context: Unit): Unit = Unit

        override fun visit(node: MidIrStatement.ConditionalJumpFallThrough, context: Unit): Unit =
            addExpression(expression = node.condition)

        override fun visit(node: MidIrStatement.Label, context: Unit): Unit = Unit

        override fun visit(node: MidIrStatement.Return, context: Unit) {
            node.returnedExpression?.let { addExpression(expression = it) }
        }

        private inner class ExpressionVisitor : MidIrLoweredExpressionVisitor<Unit, Unit> {
            override fun visit(node: MidIrExpression.Constant, context: Unit): Unit = Unit
            override fun visit(node: MidIrExpression.Name, context: Unit): Unit = add(name = node.name)
            override fun visit(node: MidIrExpression.Temporary, context: Unit): Unit = Unit

            override fun visit(node: MidIrExpression.Op, context: Unit) {
                node.e1.accept(visitor = this, context = Unit)
                node.e2.accept(visitor = this, context = Unit)
            }

            override fun visit(node: MidIrExpression.Mem, context: Unit): Unit =
                node.expression.accept(visitor = this, context = Unit)
        }
    }
}
