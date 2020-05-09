package samlang.analysis

import kotlinx.collections.immutable.PersistentSet
import kotlinx.collections.immutable.persistentSetOf
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrLoweredStatementVisitor
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.ConditionalJumpFallThrough
import samlang.ast.mir.MidIrStatement.Jump
import samlang.ast.mir.MidIrStatement.Label
import samlang.ast.mir.MidIrStatement.MoveMem
import samlang.ast.mir.MidIrStatement.MoveTemp
import samlang.ast.mir.MidIrStatement.Return

/**
 * The class that provides the available copy analysis result.
 * Avoid giving it IR statements that contains machine registers.
 */
@ExperimentalStdlibApi
class AvailableCopyAnalysis(private val statements: List<MidIrStatement>) {
    /** The control flow graph. */
    private val graph: ControlFlowGraph<MidIrStatement> = ControlFlowGraph.fromIr(statements)
    /** The mapping from a node id to different sets. */
    val copiesIn: Array<PersistentSet<Copy>>
    private val out: Array<PersistentSet<Copy>>

    init {
        val len = statements.size
        copiesIn = Array(size = len) { persistentSetOf<Copy>() }
        out = Array(size = len) { persistentSetOf<Copy>() }
        computeInOutSets()
    }

    private fun computeInOutSets() {
        val nodes = ArrayDeque<Int>()
        for (i in out.indices) {
            nodes.add(i)
        }
        val transferFunctionVisitor = TransferFunctionVisitor()
        while (!nodes.isEmpty()) {
            val nodeId = nodes.removeFirst()
            // for all copy: dest -> src
            val newInSetCopyMap = mutableMapOf<String, String>()
            val conflictingDestSet = mutableSetOf<String>()
            for (prevNodeId in graph.getParentIds(nodeId)) {
                for (copy in out[prevNodeId]) {
                    val dest = copy.dest
                    val existingSrc = newInSetCopyMap[dest]
                    if (existingSrc == null) {
                        newInSetCopyMap[dest] = copy.src
                    }
                    if (copy.src == existingSrc) {
                        continue
                    }
                    conflictingDestSet += dest
                }
            }
            newInSetCopyMap.keys.removeAll(conflictingDestSet)
            val newInSet = newInSetCopyMap.entries.fold(initial = persistentSetOf<Copy>()) { accumulator, entry ->
                accumulator.add(element = Copy(dest = entry.key, src = entry.value))
            }
            // new in set is the intersection of all parent outs
            copiesIn[nodeId] = newInSet
            val oldOutSet = out[nodeId]
            val newOutSet = statements[nodeId].accept(transferFunctionVisitor, nodeId)
            out[nodeId] = newOutSet
            if (newOutSet != oldOutSet) {
                nodes += graph.getChildrenIds(nodeId)
            }
        }
    }

    /**
     * The class that acts as the transfer function.
     */
    private inner class TransferFunctionVisitor : MidIrLoweredStatementVisitor<Int, PersistentSet<Copy>> {
        override fun visit(node: MoveTemp, context: Int): PersistentSet<Copy> {
            val destId = node.tempId
            val src = node.source
            var newOutSet = persistentSetOf<Copy>()
            for (copy in copiesIn[context]) {
                if (copy.dest == destId || copy.src == destId) {
                    continue
                }
                newOutSet = newOutSet.add(copy)
            }
            if (src is Temporary) {
                val srcId = src.id
                newOutSet = newOutSet.add(Copy(dest = destId, src = srcId))
            }
            return newOutSet
        }

        override fun visit(node: MoveMem, context: Int): PersistentSet<Copy> = copiesIn[context]

        override fun visit(node: MidIrStatement.CallFunction, context: Int): PersistentSet<Copy> {
            val destIds = mutableSetOf<String>()
            node.returnCollector?.let { destIds.add(element = it.id) }
            var newOutSet = persistentSetOf<Copy>()
            // destroy all copies related to return value collectors
            for (copy in copiesIn[context]) {
                if (copy.dest in destIds || copy.src in destIds) {
                    continue
                }
                newOutSet = newOutSet.add(copy)
            }
            return newOutSet
        }

        override fun visit(node: Jump, context: Int): PersistentSet<Copy> = copiesIn[context]
        override fun visit(node: ConditionalJumpFallThrough, context: Int): PersistentSet<Copy> = copiesIn[context]
        override fun visit(node: Label, context: Int): PersistentSet<Copy> = copiesIn[context]
        override fun visit(node: Return, context: Int): PersistentSet<Copy> = copiesIn[context]
    }

    data class Copy(val dest: String, val src: String)
}
