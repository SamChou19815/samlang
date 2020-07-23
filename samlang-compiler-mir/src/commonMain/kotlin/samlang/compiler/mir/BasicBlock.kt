package samlang.compiler.mir

import samlang.ast.mir.MidIrStatement

internal class BasicBlock private constructor(val instructions: List<MidIrStatement>) {
    /** Label of the block. */
    val label: String = (instructions[0] as MidIrStatement.Label).name
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
            basicBlocks += if (firstStatement is MidIrStatement.Label) {
                BasicBlock(instructions = statements)
            } else {
                val basicBlockLabel = allocator.allocateLabel()
                statements.add(index = 0, element = MidIrStatement.Label(name = basicBlockLabel))
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
                if (statement is MidIrStatement.Jump ||
                    statement is MidIrStatement.ConditionalJump ||
                    statement is MidIrStatement.Return
                ) {
                    tempBlockList.add(statement)
                    addBasicBlock(
                        allocator = allocator,
                        basicBlocks = basicBlocks,
                        statements = tempBlockList
                    )
                    tempBlockList = mutableListOf()
                } else if (statement is MidIrStatement.Label) {
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
                    lastStatement is MidIrStatement.Jump -> block.targets += labelBlockMap[lastStatement.label]!!
                    lastStatement is MidIrStatement.ConditionalJump -> {
                        // make to reach false branch first
                        block.targets += labelBlockMap[lastStatement.label2]!!
                        block.targets += labelBlockMap[lastStatement.label1]!!
                    }
                    // jump to nowhere!
                    lastStatement is MidIrStatement.Return -> block.targets.clear()
                    i < len - 1 -> block.targets += blocksInOriginalOrder[i + 1]
                }
            }
        }
    }
}
