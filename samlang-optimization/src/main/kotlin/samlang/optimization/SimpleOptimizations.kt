package samlang.optimization

import samlang.analysis.ControlFlowGraph
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.ConditionalJumpFallThrough
import samlang.ast.mir.MidIrStatement.Jump

/** The class that performs a series of simple optimizations. */
@Suppress(names = ["ComplexRedundantLet"])
internal object SimpleOptimizations {
    /**
     * Perform these optimizations in order and return an optimized sequence of instructions.
     * - unreachable code elimination
     * - jump to immediate label elimination
     * - unused label elimination
     *
     * @return a list of all optimized statements.
     */
    @JvmStatic
    fun optimizeIr(statements: List<MidIrStatement>): List<MidIrStatement> =
        withoutUnreachableCode(statements) { ControlFlowGraph.fromIr(it) }
            .let { withoutImmediateJumpInIr(it) }
            .let { withoutUnusedLabelInIr(it) }

    private fun <T> withoutUnreachableCode(
        instructions: List<T>,
        cfgConstructor: (List<T>) -> ControlFlowGraph<T>
    ): List<T> {
        val reachableSet = hashSetOf<Int>()
        cfgConstructor(instructions).dfs { reachableSet.add(it.id) }
        // only add reachable instructions
        val reachableInstructions = arrayListOf<T>()
        val len = instructions.size
        for (i in 0 until len) {
            if (reachableSet.contains(i)) {
                reachableInstructions.add(instructions[i])
            }
        }
        return reachableInstructions
    }

    private fun withoutUnusedLabelInIr(statements: List<MidIrStatement>): List<MidIrStatement> {
        val usedLabels = statements.mapNotNullTo(hashSetOf(), { statement ->
            when (statement) {
                is Jump -> statement.label
                is ConditionalJumpFallThrough -> statement.label1
                else -> null
            }
        })
        return statements.filter { statement ->
            if (statement is MidIrStatement.Label) {
                usedLabels.contains(statement.name)
            } else {
                true
            }
        }
    }

    private fun withoutImmediateJumpInIr(
        statements: List<MidIrStatement>
    ): List<MidIrStatement> {
        val newStatements = arrayListOf<MidIrStatement>()
        val len = statements.size
        for (i in 0 until len) {
            val s = statements[i]
            if (i < len - 1) {
                val nextStatement = statements[i + 1]
                if (nextStatement is MidIrStatement.Label) {
                    val nextLabel = nextStatement.name
                    if (s is Jump) {
                        if (s.label == nextLabel) {
                            continue
                        }
                    } else if (s is ConditionalJumpFallThrough) {
                        if (s.label1 == nextLabel) {
                            continue
                        }
                    }
                }
            }
            // cannot optimize, give up
            newStatements.add(s)
        }
        return newStatements
    }
}
