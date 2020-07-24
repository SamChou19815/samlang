package samlang.compiler.mir

import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.Companion.CJUMP_FALLTHROUGH
import samlang.ast.mir.MidIrStatement.ConditionalJump
import samlang.ast.mir.MidIrStatement.Jump
import samlang.ast.mir.MidIrStatement.Return

/** The utility class used to reorganize the traces. */
internal object MidIrTraceReorganizer {
    /** @return list contains the optimized order of the starting labels. */
    private fun buildTrace(basicBlocks: List<BasicBlock>): List<BasicBlock> {
        val reorderedBlockLabels = mutableSetOf<String>()
        val reorderedBlocks = mutableListOf<BasicBlock>()
        // start building the trace at 0 because that's where function starts.
        basicBlocks.forEach { blockToStart ->
            if (blockToStart.label in reorderedBlockLabels) {
                return@forEach
            }
            val stack = buildTrace(blockToStart, reorderedBlockLabels, mutableMapOf())
            val tempList = stack.toReversedOrderedCollection()
            reorderedBlockLabels.addAll(tempList.map { it.label })
            reorderedBlocks += tempList
        }
        return reorderedBlocks
    }

    private fun buildTrace(
        block: BasicBlock,
        visited: MutableSet<String>,
        memoizedResult: MutableMap<String, SizedImmutableStack>
    ): SizedImmutableStack {
        val optimal = memoizedResult[block.label]
        if (optimal != null) return optimal
        visited.add(element = block.label)
        var bestTrace = SizedImmutableStack()
        for (nextBlock in block.targets) {
            if (visited.contains(nextBlock.label)) continue
            val fullTrace = buildTrace(block = nextBlock, visited = visited, memoizedResult = memoizedResult)
            if (fullTrace.size > bestTrace.size) {
                bestTrace = fullTrace
            }
        }
        visited.remove(element = block.label)
        val knownOptimal = bestTrace.plus(block)
        memoizedResult[block.label] = knownOptimal
        return knownOptimal
    }

    /**
     * Fix the block control flow graph inconsistencies caused by reordering.
     *
     * Potential things to fix:
     * - Jump is no longer necessary due to reordering
     * - Jump is missing due to reordering
     * - Canonicalize CJUMP to CJUMP_FALLTHROUGH
     */
    private fun emitStatements(reorderedBlocks: List<BasicBlock>): List<MidIrStatement> {
        val fixedStatements = mutableListOf<MidIrStatement>()
        val len = reorderedBlocks.size
        // remove redundant jumps, added needed jump
        for (i in 0 until len) {
            val currentBlock = reorderedBlocks[i]
            val lastStatement = currentBlock.lastStatement
            val traceImmediateNext = if (i < len - 1) reorderedBlocks[i + 1].label else null
            when (lastStatement) {
                is ConditionalJump -> {
                    val (condition1, actualTrueTarget, actualFalseTarget) = lastStatement
                    // setup previous unchanged instructions
                    val newInstructions = currentBlock.statements.dropLast(n = 1).toMutableList()
                    when {
                        actualTrueTarget == traceImmediateNext -> {
                            // need to invert condition
                            val condition = MidIrTransformUtil.invertCondition(condition1)
                            newInstructions += CJUMP_FALLTHROUGH(condition, actualFalseTarget)
                        }
                        actualFalseTarget == traceImmediateNext -> {
                            // nice! we can make it fall through!
                            newInstructions += CJUMP_FALLTHROUGH(condition1, actualTrueTarget)
                        }
                        else -> {
                            newInstructions += CJUMP_FALLTHROUGH(condition1, actualTrueTarget)
                            // force jump to false target
                            newInstructions += Jump(actualTrueTarget)
                        }
                    }
                    fixedStatements += newInstructions
                }
                is Jump, is Return -> fixedStatements += currentBlock.statements // no problem
                else -> error(message = "Bad instruction type: ${lastStatement::class}")
            }
        }
        return fixedStatements
    }

    /**
     * Reorder the statements to fix the control for LOW IR.
     *
     * @param allocator the allocator used to allocate new temp labels
     * @param originalStatements original list of statements.
     * @return the reordered and fixed statements.
     */
     fun reorder(allocator: MidIrResourceAllocator, originalStatements: List<MidIrStatement>): List<MidIrStatement> =
        emitStatements(buildTrace(BasicBlock.from(allocator, originalStatements)))
}
