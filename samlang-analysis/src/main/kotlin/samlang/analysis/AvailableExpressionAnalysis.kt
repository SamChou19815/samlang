package samlang.analysis

import samlang.ast.mir.ContainsTempDetector
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrLoweredStatementVisitor
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.ConditionalJumpFallThrough
import samlang.ast.mir.MidIrStatement.Label
import samlang.ast.mir.MidIrStatement.MoveMem
import samlang.ast.mir.MidIrStatement.MoveTemp
import samlang.ast.mir.MidIrStatement.Return

/**
 * The class that provides the available copy expression result.
 *
 * @param statements the statements to obtain available expression analysis result.
 */
class AvailableExpressionAnalysis(private val statements: List<MidIrStatement>) {
    /** The control flow graph.  */
    private val graph: ControlFlowGraph<MidIrStatement> = ControlFlowGraph.fromIr(functionStatements = statements)
    /** The mapping from a node id to expressions.  */
    private val expressionMapping: Array<Set<MidIrExpression>>
    /** The mapping from a node id to different sets  */
    val expressionsIn: Array<MutableSet<ExprInfo>>
    /** A map of instruction id to a set of expressions out of a node. */
    val expressionOut: Array<MutableSet<ExprInfo>>

    init {
        val len = statements.size
        expressionMapping = Array(size = len) { i -> SubExpressionExtractor.get(statements[i]) }
        expressionsIn = Array(size = len) { hashSetOf<ExprInfo>() }
        expressionOut = Array(size = len) { hashSetOf<ExprInfo>() }
        computeInOutSets()
    }

    private fun computeInOutSets() {
        val nodes = ArrayDeque<Int>()
        for (i in expressionOut.indices) {
            nodes += i
        }
        while (!nodes.isEmpty()) {
            val nodeId = nodes.removeFirst()
            val newInMap = hashMapOf<MidIrExpression, Int>()
            val expressionsToRemove = hashSetOf<MidIrExpression>()
            graph.getParentIds(nodeId).asSequence().map { prevNodeId -> expressionOut[prevNodeId] }.forEach { set ->
                for (info in set) {
                    val expr = info.expression
                    val appearId = info.appearId
                    val existingAppearId = newInMap[expr]
                    if (existingAppearId == null) {
                        newInMap[expr] = appearId
                    } else if (existingAppearId != appearId) {
                        expressionsToRemove.add(expr)
                    }
                }
            }
            newInMap.keys.removeAll(expressionsToRemove)
            val newInSet = newInMap.entries
                .map { (key, value) -> ExprInfo(appearId = value, expression = key) }
                .toMutableSet()
            expressionsIn[nodeId] = newInSet
            val oldOutSet = expressionOut[nodeId]
            val newOutSet = newInSet.toMutableSet()
            for (exprHere in expressionMapping[nodeId]) {
                var alreadyThere = false
                for (exprAlreadyThere in newOutSet) {
                    if (exprHere == exprAlreadyThere.expression) {
                        alreadyThere = true
                        break
                    }
                }
                if (!alreadyThere) {
                    newOutSet += ExprInfo(appearId = nodeId, expression = exprHere)
                }
            }
            statements[nodeId].accept(visitor = KillVisitor, context = newOutSet)
            expressionOut[nodeId] = newOutSet
            if (newOutSet != oldOutSet) {
                nodes += graph.getChildrenIds(nodeId)
            }
        }
    }

    /** The class that acts as the kill application. */
    private object KillVisitor : MidIrLoweredStatementVisitor<MutableSet<ExprInfo>, Unit> {
        override fun visit(node: MoveTemp, context: MutableSet<ExprInfo>) {
            val tempName = node.tempId
            context.removeIf { info -> ContainsTempDetector.check(info.expression, Temporary(tempName)) }
        }

        override fun visit(node: MoveMem, context: MutableSet<ExprInfo>) {
            // for safety, remove all mem expressions
            context.removeIf { info -> HasMemDetector.hasMem(info.expression) }
        }

        override fun visit(node: MidIrStatement.CallFunction, context: MutableSet<ExprInfo>) {
            node.returnCollector?.let { context.removeIf { info -> ContainsTempDetector.check(info.expression, it) } }
            // for safety, remove all mem expressions
            context.removeIf { info -> HasMemDetector.hasMem(info.expression) }
        }

        override fun visit(node: MidIrStatement.Jump, context: MutableSet<ExprInfo>): Unit = Unit
        override fun visit(node: ConditionalJumpFallThrough, context: MutableSet<ExprInfo>): Unit = Unit
        override fun visit(node: Label, context: MutableSet<ExprInfo>): Unit = Unit
        override fun visit(node: Return, context: MutableSet<ExprInfo>): Unit = context.clear()
    }

    /**
     * @param appearId the id of the expression where the expression appears.
     * @param expression the actual expression.
     */
    data class ExprInfo(val appearId: Int, val expression: MidIrExpression) {
        override fun toString(): String = "{ id: $appearId, expr: \"$expression\" }"
    }
}
