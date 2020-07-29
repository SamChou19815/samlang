package samlang.analysis

import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrStatement

/**
 * The class that provides the available copy expression result.
 *
 * @param statements the statements to obtain available expression analysis result.
 */
@ExperimentalStdlibApi
class AvailableExpressionAnalysis(private val statements: List<MidIrStatement>) {
    /** The control flow graph.  */
    private val graph: ControlFlowGraph<MidIrStatement> = ControlFlowGraph.fromIr(functionStatements = statements)
    /** The mapping from a node id to expressions.  */
    private val expressionMapping: Array<Set<MidIrExpression>>
    /** The mapping from a node id to different sets  */
    private val expressionsIn: Array<MutableSet<ExprInfo>>
    /** A map of instruction id to a set of expressions out of a node. */
    val expressionOut: Array<MutableSet<ExprInfo>>

    init {
        val len = statements.size
        expressionMapping = Array(size = len) { i -> SubExpressionExtractor.get(statements[i]) }
        expressionsIn = Array(size = len) { mutableSetOf<ExprInfo>() }
        expressionOut = Array(size = len) { mutableSetOf<ExprInfo>() }
        computeInOutSets()
    }

    private fun computeInOutSets() {
        val nodes = ArrayDeque<Int>()
        for (i in expressionOut.indices) {
            nodes += i
        }
        while (!nodes.isEmpty()) {
            val nodeId = nodes.removeFirst()
            val newInMap = mutableMapOf<MidIrExpression, Int>()
            val expressionsToRemove = mutableSetOf<MidIrExpression>()
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
            expressionOut[nodeId] = newOutSet
            if (newOutSet != oldOutSet) {
                nodes += graph.getChildrenIds(nodeId)
            }
        }
    }

    /**
     * @param appearId the id of the expression where the expression appears.
     * @param expression the actual expression.
     */
    data class ExprInfo(val appearId: Int, val expression: MidIrExpression) {
        override fun toString(): String = "{ id: $appearId, expr: \"$expression\" }"
    }
}
