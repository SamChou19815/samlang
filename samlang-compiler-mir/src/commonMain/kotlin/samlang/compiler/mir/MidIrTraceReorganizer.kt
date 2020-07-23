package samlang.compiler.mir

import kotlinx.collections.immutable.PersistentSet
import kotlinx.collections.immutable.persistentSetOf
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.Companion.CJUMP_FALLTHROUGH
import samlang.ast.mir.MidIrStatement.ConditionalJump
import samlang.ast.mir.MidIrStatement.Jump
import samlang.ast.mir.MidIrStatement.Label
import samlang.ast.mir.MidIrStatement.Return

/** The utility class used to reorganize the traces. */
@ExperimentalStdlibApi
internal object MidIrTraceReorganizer {
    /**
     * A basic block of instructions.
     *
     * @param instructions all the instructions, including the last one.
     */
    private class BasicBlock private constructor(val instructions: List<MidIrStatement>) {
        /** Label of the block. */
        val label: String = (instructions[0] as Label).name
        /** The last statement. It always exists. It is used to tell where to jump. */
        val lastStatement: MidIrStatement = instructions[instructions.size - 1]
        /** Potential labels to go after the block. */
        val targets: MutableList<BasicBlock> = mutableListOf()

        override fun toString(): String = "BasicBlock $label"

        companion object {
            private fun addBasicBlock(
                allocator: MidIrResourceAllocator,
                basicBlocks: MutableList<BasicBlock>,
                statements: MutableList<MidIrStatement>
            ) {
                if (statements.isEmpty()) {
                    return
                }
                val firstStatement = statements[0]
                basicBlocks += if (firstStatement is Label) {
                    BasicBlock(instructions = statements)
                } else {
                    val basicBlockLabel = allocator.allocateLabel()
                    statements.add(index = 0, element = Label(name = basicBlockLabel))
                    BasicBlock(instructions = statements)
                }
            }

            /**
             * Segment the statements into basic blocks.
             *
             * @param statements a list of statements in original order.
             * @return a list of simply segmented basic blocks.
             */
            fun from(
                allocator: MidIrResourceAllocator,
                statements: List<MidIrStatement>
            ): List<BasicBlock> {
                val basicBlocks = mutableListOf<BasicBlock>()
                var tempBlockList = mutableListOf<MidIrStatement>()
                for (statement in statements) {
                    if (statement is Jump ||
                        statement is ConditionalJump ||
                        statement is Return
                    ) {
                        tempBlockList.add(statement)
                        addBasicBlock(
                            allocator = allocator,
                            basicBlocks = basicBlocks,
                            statements = tempBlockList
                        )
                        tempBlockList = mutableListOf()
                    } else if (statement is Label) {
                        addBasicBlock(
                            allocator = allocator,
                            basicBlocks = basicBlocks,
                            statements = tempBlockList
                        )
                        tempBlockList = mutableListOf()
                        tempBlockList.add(statement)
                    } else {
                        tempBlockList.add(statement)
                    }
                }
                addBasicBlock(
                    allocator = allocator,
                    basicBlocks = basicBlocks,
                    statements = tempBlockList
                )
                patchBasicBlocks(basicBlocks)
                return basicBlocks
            }

            private fun patchBasicBlocks(blocksInOriginalOrder: List<BasicBlock>) {
                val len = blocksInOriginalOrder.size
                val labelBlockMap: MutableMap<String, BasicBlock> = mutableMapOf()
                for (block in blocksInOriginalOrder) {
                    val label = block.label
                    labelBlockMap[label] = block
                }
                for (i in 0 until len) {
                    val block = blocksInOriginalOrder[i]
                    val lastStatement = block.lastStatement
                    when {
                        lastStatement is Jump -> block.targets += labelBlockMap[lastStatement.label]!!
                        lastStatement is ConditionalJump -> {
                            // make to reach false branch first
                            block.targets += labelBlockMap[lastStatement.label2]!!
                            block.targets += labelBlockMap[lastStatement.label1]!!
                        }
                        // jump to nowhere!
                        lastStatement is Return -> block.targets.clear()
                        i < len - 1 -> block.targets += blocksInOriginalOrder[i + 1]
                    }
                }
            }
        }
    }

    /** @return list contains the optimized order of the starting labels. */
    private fun buildTrace(basicBlocks: List<BasicBlock>): List<BasicBlock> {
        val originalTrace= ArrayDeque(basicBlocks)
        val unusedBlocks: MutableSet<String?> = mutableSetOf()
        unusedBlocks += basicBlocks.map { it.label }
        val newTrace = mutableListOf<BasicBlock>()
        // start building the trace at 0 because that's where function starts.
        while (true) {
            var blockToStart: BasicBlock? = null
            while (!originalTrace.isEmpty()) {
                blockToStart = originalTrace.removeFirst()
                blockToStart = if (blockToStart.label in unusedBlocks) {
                    break
                } else {
                    null
                }
            }
            if (blockToStart == null) { // used all the blocks!
                break
            }
            val stack = buildTrace(
                block = blockToStart,
                unusedBlocks = unusedBlocks,
                visited = persistentSetOf(),
                memoizedResult = mutableMapOf()
            ) ?: error(message = "Impossible!")
            val tempList = stack.toReversedOrderedCollection()
            unusedBlocks.removeAll(tempList.map { it.label })
            newTrace += tempList
        }
        return newTrace
    }

    /**
     * Functionally build one segment of the trace.
     *
     * @param block the starting block.
     * @param visited visited elements in this build.
     * @param memoizedResult the memoized optimal result.
     * @return the built trace, or null if it's impossible to build one starting at id.
     */
    private fun buildTrace(
        block: BasicBlock,
        unusedBlocks: MutableSet<String?>,
        visited: PersistentSet<String>,
        memoizedResult: MutableMap<String, SizedImmutableStack<BasicBlock>>
    ): SizedImmutableStack<BasicBlock>? {
        if (!unusedBlocks.contains(block.label) || visited.contains(block.label)) {
            return null
        }
        val optimal = memoizedResult[block.label]
        if (optimal != null) {
            return optimal
        }
        val newVisited = visited.add(element = block.label)
        var bestTrace = SizedImmutableStack<BasicBlock> { it.instructions.size }
        val targetBlocks = block.targets
        for (nextBlock in targetBlocks) {
            val fullTrace = buildTrace(
                block = nextBlock,
                unusedBlocks = unusedBlocks,
                visited = newVisited,
                memoizedResult = memoizedResult
            )
            if (fullTrace != null) {
                if (fullTrace.size > bestTrace.size) {
                    bestTrace = fullTrace
                }
            }
        }
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
                is Jump -> {
                    val actualJumpTarget = lastStatement.label
                    fixedStatements += if (actualJumpTarget != traceImmediateNext) {
                        // jump is necessary, keep it
                        currentBlock.instructions
                    } else {
                        // remove the jump
                        currentBlock.instructions.dropLast(n = 1)
                    }
                }
                is ConditionalJump -> {
                    val (condition1, actualTrueTarget, actualFalseTarget) = lastStatement
                    // setup previous unchanged instructions
                    val newInstructions = currentBlock.instructions.dropLast(n = 1).toMutableList()
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
                is Return -> fixedStatements += currentBlock.instructions // no problem
                else -> {
                    val actualNextTargets = currentBlock.targets
                    var actualNextTarget: String?
                    actualNextTarget = when {
                        actualNextTargets.isEmpty() -> null
                        actualNextTargets.size == 1 -> actualNextTargets[0].label
                        else -> error(message = "Impossible!")
                    }
                    fixedStatements += if (traceImmediateNext != null) {
                        if (traceImmediateNext != actualNextTarget && actualNextTarget != null) {
                            // the immediate next is not equal to the original next
                            // need to jump to actualNextTarget!
                            val instructions = currentBlock.instructions.toMutableList()
                            instructions += Jump(actualNextTarget)
                            instructions
                        } else {
                            // original block is OK!
                            currentBlock.instructions
                        }
                    } else {
                        if (actualNextTarget == null) {
                            // originally nothing, current nothing. Fine
                            currentBlock.instructions
                        } else {
                            val instructions = currentBlock.instructions.toMutableList()
                            instructions += Jump(actualNextTarget)
                            instructions
                        }
                    }
                }
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
        emitStatements(buildTrace(BasicBlock.from(allocator = allocator, statements = originalStatements)))
}
