package samlang.compiler.mir

import java.util.ArrayDeque
import java.util.Deque
import kotlinx.collections.immutable.PersistentSet
import kotlinx.collections.immutable.persistentSetOf
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.Companion.CJUMP_FALLTHROUGH
import samlang.ast.mir.MidIrStatement.ConditionalJump
import samlang.ast.mir.MidIrStatement.Jump
import samlang.ast.mir.MidIrStatement.Label
import samlang.ast.mir.MidIrStatement.Return

/**
 * The utility class used to reorganize the traces.
 *
 * @param blocksInOriginalOrder a list of blocks in their original order.
 */
internal class TraceReorganizer private constructor(blocksInOriginalOrder: List<BasicBlock>) {
    private val emptyTrackStack: SizedImmutableStack<String> = SizedImmutableStack { label -> getStackSize(label) }
    /** The mapping from label to block id. */
    private val labelBlockMap: MutableMap<String, BasicBlock> = hashMapOf()
    /** The mapping that tells the potential places to go after the block. */
    private val targets: MutableMap<String, List<String>> = hashMapOf()
    /** A set of currently unused blocks. */
    private val unusedBlocks: MutableSet<String?> = hashSetOf()
    /** The original trace order. */
    private val originalTrace: Deque<String> = ArrayDeque()
    /** The new trace to be built. */
    private val newTrace: MutableList<String> = arrayListOf()

    init {
        // build the blocks and targets map for later traversal.
        initialize(blocksInOriginalOrder)
        buildTrace()
    }

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
                val basicBlocks = arrayListOf<BasicBlock>()
                var tempBlockList = arrayListOf<MidIrStatement>()
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
                        tempBlockList = arrayListOf()
                    } else if (statement is Label) {
                        addBasicBlock(
                            allocator = allocator,
                            basicBlocks = basicBlocks,
                            statements = tempBlockList
                        )
                        tempBlockList = arrayListOf()
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
     *
     * @param blocksInOriginalOrder a list of blocks in their original order.
     */
    private fun initialize(blocksInOriginalOrder: List<BasicBlock>) {
        val len = blocksInOriginalOrder.size
        for (block in blocksInOriginalOrder) {
            val label = block.label
            labelBlockMap[label] = block
            unusedBlocks += label
            originalTrace.addLast(label)
        }
        for (i in 0 until len) {
            val block = blocksInOriginalOrder[i]
            val targetList = arrayListOf<String>()
            val lastStatement = block.lastStatement
            when {
                lastStatement is Jump -> {
                    val label = lastStatement.label
                    targetList += label
                }
                lastStatement is ConditionalJump -> {
                    val (_, label1, label2) = lastStatement
                    // make to reach false branch first
                    targetList += label2
                    targetList += label1
                }
                lastStatement is Return -> { // jump to no where!
                    targetList.clear()
                }
                i < len - 1 -> {
                    targetList += blocksInOriginalOrder[i + 1].label
                }
            }
            targets[block.label] = targetList
        }
    }

    /**
     * Build the entire trace.
     */
    private fun buildTrace() { // start building the trace at 0 because that's where function starts.
        while (true) {
            var labelToStart: String? = null
            while (!originalTrace.isEmpty()) {
                labelToStart = originalTrace.pollFirst()
                labelToStart = if (labelToStart in unusedBlocks) {
                    break
                } else {
                    null
                }
            }
            if (labelToStart == null) { // used all the blocks!
                break
            }
            buildTrace(labelToStart = labelToStart)
        }
    }

    /**
     * The size function for SizedImmutableStack.
     *
     * @param label the label to find size.
     * @return the size.
     */
    private fun getStackSize(label: String): Int {
        return labelBlockMap[label]!!.instructions.size
    }

    /**
     * Build a trace starting at the block with the given id.
     *
     * @param labelToStart starting block label.
     */
    private fun buildTrace(labelToStart: String) {
        val stack = buildTrace(id = labelToStart, visited = persistentSetOf(), memoizedResult = hashMapOf())
            ?: error(message = "Impossible!")
        val tempList = stack.toReversedOrderedCollection()
        unusedBlocks.removeAll(tempList)
        newTrace.addAll(tempList)
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
        var bestTrace = emptyTrackStack
        val targetIds = targets[id]!!
        for (nextId in targetIds) {
            val fullTrace = buildTrace(id = nextId, visited = newVisited, memoizedResult = memoizedResult)
            if (fullTrace != null) {
                if (fullTrace.size() > bestTrace.size()) {
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
     * @return a list of fixed blocks.
     */
    private fun fixBlocks(): List<BasicBlock> {
        val reorderedBlocks = newTrace.map { key -> labelBlockMap[key] }
        val fixedBlocks = arrayListOf<BasicBlock>()
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
                            val condition = IrTransformUtil.invertCondition(condition1)
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
        @JvmStatic
        fun reorder(allocator: MidIrResourceAllocator, originalStatements: List<MidIrStatement>): List<MidIrStatement> {
            val basicBlocks = BasicBlock.from(allocator = allocator, statements = originalStatements)
            return TraceReorganizer(blocksInOriginalOrder = basicBlocks)
                .fixBlocks()
                .asSequence()
                .map { it.instructions }
                .flatten()
                .toList()
        }
    }
}
