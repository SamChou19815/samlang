package samlang.analysis

import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrLoweredExpressionVisitor
import samlang.ast.mir.MidIrLoweredStatementVisitor
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.CallFunction
import samlang.ast.mir.MidIrStatement.ConditionalJumpFallThrough
import samlang.ast.mir.MidIrStatement.Jump
import samlang.ast.mir.MidIrStatement.MoveMem
import samlang.ast.mir.MidIrStatement.MoveTemp

/**
 * The class that provides the live variable analysis result, for IR code.
 */
class LiveTempAnalysis(statements: List<MidIrStatement>) {
    /** The mapping from a node id to different variable sets. */
    private val defs: Array<MutableSet<String>>
    private val uses: Array<MutableSet<String>>
    /** A map of instruction id to a set of live variables out a node. */
    val liveTempOut: Array<MutableSet<String>>

    init {
        val graph = ControlFlowGraph.fromIr(statements)
        val findDefUseVisitor = FindDefUseVisitor()
        // setup defs, uses, empty in and out
        val len = statements.size
        defs = Array(size = len) { HashSet<String>() }
        uses = Array(size = len) { HashSet<String>() }
        val inSet: Array<MutableSet<String>> = Array(size = len) { HashSet<String>() }
        liveTempOut = Array(size = len) { HashSet<String>() }
        for (i in 0 until len) {
            val statement = statements[i]
            statement.accept(visitor = findDefUseVisitor, context = i)
        }
        // run data flow analysis
        LiveVariableAnalysis.computeInOutSets(graph, defs, uses, inSet, liveTempOut)
    }

    private inner class FindDefUseVisitor : MidIrLoweredStatementVisitor<Int, Unit> {
        private val exprVisitor: ExprVisitor = ExprVisitor()

        private fun findDef(temporary: String, id: Int) {
            defs[id].add(temporary)
        }

        private fun findUse(expression: MidIrExpression, id: Int): Unit =
            expression.accept(visitor = exprVisitor, context = id)

        override fun visit(node: MoveTemp, context: Int) {
            findDef(temporary = node.tempId, id = context)
            findUse(expression = node.source, id = context)
        }

        override fun visit(node: MoveMem, context: Int) {
            findUse(expression = node.memLocation, id = context)
            findUse(expression = node.source, id = context)
        }

        override fun visit(node: CallFunction, context: Int) {
            node.returnCollector?.let { temp -> findDef(temporary = temp.id, id = context) }
            node.arguments.forEach { findUse(expression = it, id = context) }
        }

        override fun visit(node: Jump, context: Int): Unit = Unit

        override fun visit(node: ConditionalJumpFallThrough, context: Int): Unit =
            findUse(expression = node.condition, id = context)

        override fun visit(node: MidIrStatement.Label, context: Int): Unit = Unit

        override fun visit(node: MidIrStatement.Return, context: Int) {
            node.returnedExpression?.let { findUse(expression = it, id = context) }
        }

        private inner class ExprVisitor : MidIrLoweredExpressionVisitor<Int, Unit> {
            override fun visit(node: MidIrExpression.Constant, context: Int): Unit = Unit
            override fun visit(node: MidIrExpression.Name, context: Int): Unit = Unit

            override fun visit(node: Temporary, context: Int) {
                uses[context].add(node.id)
            }

            override fun visit(node: MidIrExpression.Op, context: Int) {
                node.e1.accept(visitor = this, context = context)
                node.e2.accept(visitor = this, context = context)
            }

            override fun visit(node: MidIrExpression.Mem, context: Int): Unit =
                node.expression.accept(visitor = this, context = context)
        }
    }
}
