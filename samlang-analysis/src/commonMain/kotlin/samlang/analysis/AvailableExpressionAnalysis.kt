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
    private val expressionsIn: Array<Map<MidIrExpression, Set<Int>>>
    /** A map of instruction id to a set of expressions out of a node. */
    val expressionOut: Array<Map<MidIrExpression, Set<Int>>>

    init {
        val len = statements.size
        expressionMapping = Array(size = len) { i -> SubExpressionExtractor.get(statements[i]) }
        expressionsIn = Array(size = len) { mutableMapOf<MidIrExpression, Set<Int>>() }
        expressionOut = Array(size = len) { mutableMapOf<MidIrExpression, Set<Int>>() }
        computeInOutSets()
    }

    private fun computeInOutSets() {
        val nodes = ArrayDeque<Int>()
        for (i in expressionOut.indices) {
            nodes += i
        }
        while (!nodes.isEmpty()) {
            val nodeId = nodes.removeFirst()
            val newInMap = mutableMapOf<MidIrExpression, Set<Int>>()
            val parents = graph.getParentIds(nodeId).map { prevNodeId -> expressionOut[prevNodeId] }
            if (parents.isNotEmpty()) {
                val otherParents = parents.subList(fromIndex = 1, toIndex = parents.size)
                parents[0].forEach { info ->
                    val sameExpressionAppearSiteFromOtherParentsNullable = otherParents.map {
                        if (it.containsKey(key = info.key)) info.value else null
                    }
                    val sameExpressionAppearSiteFromOtherParents = sameExpressionAppearSiteFromOtherParentsNullable.filterNotNull()
                    if (sameExpressionAppearSiteFromOtherParentsNullable.size == sameExpressionAppearSiteFromOtherParents.size) {
                        newInMap[info.key] = (sameExpressionAppearSiteFromOtherParents.flatten() + info.value).toSet()
                    }
                }
            }
            expressionsIn[nodeId] = newInMap
            val oldOutMap = expressionOut[nodeId]
            val newOutMap = newInMap.toMutableMap()
            for (exprHere in expressionMapping[nodeId]) {
                if (!oldOutMap.containsKey(key = exprHere)) {
                    newOutMap[exprHere] = setOf(nodeId)
                }
                // We do nothing if things are already there, because we want to keep the first appearance source.
            }
            expressionOut[nodeId] = newOutMap
            if (oldOutMap != newOutMap) {
                nodes += graph.getChildrenIds(nodeId)
            }
        }
    }
}
