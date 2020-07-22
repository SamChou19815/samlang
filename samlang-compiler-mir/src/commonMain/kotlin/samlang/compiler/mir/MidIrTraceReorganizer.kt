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
internal class MidIrTraceReorganizer private constructor(blocksInOriginalOrder: List<BasicBlock>) {
    /** The mapping from label to block id. */
    private val labelBlockMap: Map<String, BasicBlock>
    /** The mapping that tells the potential places to go after the block. */
    private val targets: Map<String, List<String>>

    /**
     * A basic block of instructions.
     *
     * @param instructions all the instructions, including the last one.
     */
    private data class BasicBlock(val instructions: List<MidIrStatement>) {
        /** Label of the block. */
        val label: String = (instructions[0] as Label).name
        /** The last statement. It always exists. It is used to tell where to jump. */
        val lastStatement: MidIrStatement = instructions[instructions.size - 1]

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
                return basicBlocks
            }
        }
    }

    /**
     * Initialize various fields to create a initial state of unordered blocks.
     * Once this is called. Traversal can begin.
     */
    init {
        val len = blocksInOriginalOrder.size
        val labelBlockMap: MutableMap<String, BasicBlock> = mutableMapOf()
        val targets: MutableMap<String, List<String>> = mutableMapOf()
        for (block in blocksInOriginalOrder) {
            val label = block.label
            labelBlockMap[label] = block
        }
        for (i in 0 until len) {
            val block = blocksInOriginalOrder[i]
            val targetList = mutableListOf<String>()
            val lastStatement = block.lastStatement
            when {
                lastStatement is Jump -> targetList += lastStatement.label
                lastStatement is ConditionalJump -> {
                    // make to reach false branch first
                    targetList += lastStatement.label2
                    targetList += lastStatement.label1
                }
                // jump to nowhere!
                lastStatement is Return -> targetList.clear()
                i < len - 1 -> targetList += blocksInOriginalOrder[i + 1].label
            }
            targets[block.label] = targetList
        }
        this.labelBlockMap = labelBlockMap
        this.targets = targets
    }

    /** @return list contains the optimized order of the starting labels. */
    private fun buildTrace(originalTrace: ArrayDeque<String>): List<String> {
        val unusedBlocks: MutableSet<String?> = mutableSetOf()
        unusedBlocks += labelBlockMap.keys
        val newTrace = mutableListOf<String>()
        // start building the trace at 0 because that's where function starts.
        while (true) {
            var labelToStart: String? = null
            while (!originalTrace.isEmpty()) {
                labelToStart = originalTrace.removeFirst()
                labelToStart = if (labelToStart in unusedBlocks) {
                    break
                } else {
                    null
                }
            }
            if (labelToStart == null) { // used all the blocks!
                break
            }
            val stack = buildTrace(
                id = labelToStart,
                unusedBlocks = unusedBlocks,
                visited = persistentSetOf(),
                memoizedResult = mutableMapOf()
            ) ?: error(message = "Impossible!")
            val tempList = stack.toReversedOrderedCollection()
            unusedBlocks.removeAll(tempList)
            newTrace += tempList
        }
        return newTrace
    }

    /**
     * Functionally build one segment of the trace.
     *
     * @param id the starting label id.
     * @param visited visited elements in this build.
     * @param memoizedResult the memoized optimal result.
     * @return the built trace, or null if it's impossible to build one starting at id.
     */
    private fun buildTrace(
        id: String,
        unusedBlocks: MutableSet<String?>,
        visited: PersistentSet<String>,
        memoizedResult: MutableMap<String, SizedImmutableStack<String>>
    ): SizedImmutableStack<String>? {
        if (!unusedBlocks.contains(id) || visited.contains(id)) {
            return null
        }
        val optimal = memoizedResult[id]
        if (optimal != null) {
            return optimal
        }
        val newVisited = visited.add(element = id)
        var bestTrace = SizedImmutableStack<String> { label -> labelBlockMap[label]!!.instructions.size }
        val targetIds = targets[id]!!
        for (nextId in targetIds) {
            val fullTrace = buildTrace(
                id = nextId,
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
        val knownOptimal = bestTrace.plus(id)
        memoizedResult[id] = knownOptimal
        return knownOptimal
    }

    /**
     * Fix the block control flow graph inconsistencies caused by reordering.
     *
     * Potential things to fix:
     * - Jump is no longer necessary due to reordering
     * - Jump is missing due to reordering
     * - Canonicalize CJUMP to CJUMP_FALLTHROUGH
     *
     * @return a list of fixed blocks.
     */
    private fun fixBlocks(newTrace: List<String>): List<BasicBlock> {
        val reorderedBlocks = newTrace.map { key -> labelBlockMap[key] }
        val fixedBlocks = mutableListOf<BasicBlock>()
        val len = reorderedBlocks.size
        // remove redundant jumps, added needed jump
        for (i in 0 until len) {
            val currentBlock = reorderedBlocks[i]
            val currentBlockLabel = currentBlock!!.label
            val lastStatement = currentBlock.lastStatement
            val traceImmediateNext = if (i < len - 1) newTrace[i + 1] else null
            var fixedBlock: BasicBlock
            when (lastStatement) {
                is Jump -> {
                    val actualJumpTarget = lastStatement.label
                    fixedBlock =
                        if (actualJumpTarget != traceImmediateNext) {
                            // jump is necessary, keep it
                            currentBlock
                        } else {
                            // remove the jump
                            BasicBlock(instructions = currentBlock.instructions.dropLast(n = 1))
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
                    fixedBlock = BasicBlock(newInstructions)
                }
                is Return -> fixedBlock = currentBlock // no problem
                else -> {
                    val actualNextTargets = targets[currentBlockLabel]!!
                    var actualNextTarget: String?
                    actualNextTarget = when {
                        actualNextTargets.isEmpty() -> null
                        actualNextTargets.size == 1 -> actualNextTargets[0]
                        else -> error(message = "Impossible!")
                    }
                    fixedBlock = if (traceImmediateNext != null) {
                        if (traceImmediateNext != actualNextTarget && actualNextTarget != null) {
                            // the immediate next is not equal to the original next
                            // need to jump to actualNextTarget!
                            val instructions = currentBlock.instructions.toMutableList()
                            instructions += Jump(actualNextTarget)
                            BasicBlock(instructions = instructions)
                        } else {
                            // original block is OK!
                            currentBlock
                        }
                    } else {
                        if (actualNextTarget == null) {
                            // originally nothing, current nothing. Fine
                            currentBlock
                        } else {
                            val instructions = currentBlock.instructions.toMutableList()
                            instructions += Jump(actualNextTarget)
                            BasicBlock(instructions = instructions)
                        }
                    }
                }
            }
            fixedBlocks += fixedBlock
        }
        return fixedBlocks
    }

    companion object {
        /**
         * Reorder the statements to fix the control for LOW IR.
         *
         * @param allocator the allocator used to allocate new temp labels
         * @param originalStatements original list of statements.
         * @return the reordered and fixed statements.
         */
        fun reorder(allocator: MidIrResourceAllocator, originalStatements: List<MidIrStatement>): List<MidIrStatement> {
            val basicBlocks = BasicBlock.from(allocator = allocator, statements = originalStatements)
            return MidIrTraceReorganizer(blocksInOriginalOrder = basicBlocks)
                .run { fixBlocks(buildTrace(ArrayDeque(basicBlocks.map { it.label }))) }
                .asSequence()
                .map { it.instructions }
                .flatten()
                .toList()
        }
    }
}
