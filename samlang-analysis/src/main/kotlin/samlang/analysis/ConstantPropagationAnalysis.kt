package samlang.analysis

import samlang.analysis.ConstantPropagationAnalysis.ConstantStatus.KnownConstant
import samlang.analysis.ConstantPropagationAnalysis.ConstantStatus.Unknown
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrLoweredExpressionVisitor
import samlang.ast.mir.MidIrLoweredStatementVisitor
import samlang.ast.mir.MidIrOperator
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.CallFunction
import samlang.ast.mir.MidIrStatement.ConditionalJumpFallThrough
import samlang.ast.mir.MidIrStatement.Jump
import samlang.ast.mir.MidIrStatement.Label
import samlang.ast.mir.MidIrStatement.MoveMem
import samlang.ast.mir.MidIrStatement.MoveTemp
import samlang.ast.mir.MidIrStatement.Return

/**
 * The class that provides the constant propagation analysis result.
 *
 * @param statements the statements to obtain constant propagation analysis result.
 */
class ConstantPropagationAnalysis(statements: List<MidIrStatement>) {
    /** The control flow graph. */
    private val graph: ControlFlowGraph<MidIrStatement> = ControlFlowGraph.fromIr(functionStatements = statements)
    /** A list of original statements. */
    private val originalStatements: List<MidIrStatement> = statements
    private val `in`: Array<MutableMap<String, ConstantStatus>>
    private val out: Array<MutableMap<String, ConstantStatus>>
    /** Constants into the node. */
    val constantsIn: Array<MutableMap<String, Long>>

    init {
        val len = statements.size
        `in` = Array(size = len) { hashMapOf<String, ConstantStatus>() }
        out = Array(size = len) { hashMapOf<String, ConstantStatus>() }
        constantsIn = Array(size = len) { hashMapOf<String, Long>() }
        computeInOutSet()
        computeConstantsIn()
    }

    private fun computeInOutSet() {
        val nodes = ArrayDeque<Int>()
        for (i in out.indices) {
            nodes += i
        }
        while (!nodes.isEmpty()) {
            val nodeId = nodes.removeFirst()
            val statement = originalStatements[nodeId]
            val newInMap = hashMapOf<String, ConstantStatus>()
            for (parentId in graph.getParentIds(nodeId)) {
                for ((key, value) in out[parentId]) {
                    newInMap.merge(key, value) { obj, other -> obj.meet(other) }
                }
            }
            `in`[nodeId] = newInMap
            val oldOutMap = out[nodeId]
            val transferFunctionVisitor = TransferFunctionVisitor(newInMap)
            statement.accept(transferFunctionVisitor, Unit)
            val newOutMap = transferFunctionVisitor.newOutMap
            out[nodeId] = newOutMap
            if (oldOutMap != newOutMap) {
                nodes += graph.getChildrenIds(nodeId)
            }
        }
    }

    private fun computeConstantsIn() {
        val len = `in`.size
        for (i in 0 until len) {
            val constantsInMap = constantsIn[i]
            for ((name, status) in `in`[i]) {
                if (status is KnownConstant) {
                    constantsInMap[name] = status.value
                }
            }
        }
    }

    private inner class TransferFunctionVisitor(
        private val newInMap: Map<String, ConstantStatus>
    ) : MidIrLoweredStatementVisitor<Unit, Unit> {
        val newOutMap: MutableMap<String, ConstantStatus> = newInMap.toMutableMap()

        override fun visit(node: MoveTemp, context: Unit) {
            val folderVisitor = ContextAwareConstantFolder()
            val srcResult = node.source.accept(folderVisitor, Unit)
            val dest = node.tempId
            newOutMap[dest] = srcResult
        }

        override fun visit(node: MoveMem, context: Unit): Unit = Unit

        override fun visit(node: CallFunction, context: Unit) {
            node.returnCollector?.let { newOutMap[it.id] = Unknown }
        }

        override fun visit(node: Jump, context: Unit): Unit = Unit
        override fun visit(node: ConditionalJumpFallThrough, context: Unit): Unit = Unit
        override fun visit(node: Label, context: Unit): Unit = Unit
        override fun visit(node: Return, context: Unit): Unit = Unit

        private inner class ContextAwareConstantFolder :
            MidIrLoweredExpressionVisitor<Unit, ConstantStatus> {
            override fun visit(node: MidIrExpression.Constant, context: Unit): ConstantStatus =
                KnownConstant(node.value)

            // memory address is not known to us
            override fun visit(node: MidIrExpression.Name, context: Unit): ConstantStatus = Unknown

            override fun visit(node: MidIrExpression.Temporary, context: Unit): ConstantStatus =
                newInMap[node.id] ?: Unknown

            override fun visit(node: MidIrExpression.Op, context: Unit): ConstantStatus {
                val status1 = node.e1.accept(visitor = this, context = Unit)
                val status2 = node.e2.accept(visitor = this, context = Unit)
                return when (node.operator) {
                    MidIrOperator.ADD -> status1.map { known ->
                        status2.map { KnownConstant(value = known.value + it.value) }
                    }
                    MidIrOperator.SUB -> status1.map { known ->
                        status2.map { KnownConstant(value = known.value - it.value) }
                    }
                    MidIrOperator.MUL -> status1.map { known ->
                        status2.map { KnownConstant(value = known.value * it.value) }
                    }
                    MidIrOperator.DIV -> status1.map { known ->
                        status2.map { c ->
                            val v2 = c.value
                            if (v2 == 0L) {
                                Unknown
                            } else {
                                KnownConstant(value = known.value / v2)
                            }
                        }
                    }
                    MidIrOperator.MOD -> status1.map { known ->
                        status2.map { c ->
                            val v2 = c.value
                            if (v2 == 0L) {
                                Unknown
                            } else {
                                KnownConstant(value = known.value % v2)
                            }
                        }
                    }
                    MidIrOperator.AND -> status1.map { known ->
                        val v = known.value
                        status2.map { c -> KnownConstant(value = v and c.value) }
                    }
                    MidIrOperator.OR -> status1.map { known ->
                        status2.map { c -> KnownConstant(value = known.value or c.value) }
                    }
                    MidIrOperator.XOR -> status1.map { known ->
                        status2.map { c -> KnownConstant(value = known.value xor c.value) }
                    }
                    MidIrOperator.LT -> status1.map { known ->
                        status2.map { c -> KnownConstant(if (known.value < c.value) 1 else 0) }
                    }
                    MidIrOperator.LE -> status1.map { known ->
                        status2.map { c -> KnownConstant(if (known.value <= c.value) 1 else 0) }
                    }
                    MidIrOperator.GT -> status1.map { known ->
                        status2.map { c -> KnownConstant(if (known.value > c.value) 1 else 0) }
                    }
                    MidIrOperator.GE -> status1.map { known ->
                        status2.map { c -> KnownConstant(if (known.value >= c.value) 1 else 0) }
                    }
                    MidIrOperator.EQ -> status1.map { known ->
                        status2.map { c -> KnownConstant(if (known.value == c.value) 1 else 0) }
                    }
                    MidIrOperator.NE -> status1.map { known ->
                        status2.map { c -> KnownConstant(if (known.value != c.value) 1 else 0) }
                    }
                }
            }

            override fun visit(node: MidIrExpression.Mem, context: Unit): ConstantStatus = Unknown
        }
    }

    private sealed class ConstantStatus {
        fun map(f: (KnownConstant) -> ConstantStatus): ConstantStatus = (this as? KnownConstant)?.let(f) ?: Unknown

        /**
         * @param other the other constant status to meet.
         * @return the status after meet.
         */
        fun meet(other: ConstantStatus): ConstantStatus = map { known ->
            other.map { c -> if (known.value == c.value) this else Unknown }
        }

        data class KnownConstant(val value: Long) : ConstantStatus()
        object Unknown : ConstantStatus()
    }
}
