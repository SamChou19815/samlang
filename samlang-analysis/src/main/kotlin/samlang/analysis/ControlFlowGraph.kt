package samlang.analysis

import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.JumpLabel
import samlang.ast.asm.AssemblyInstruction.JumpType
import samlang.ast.mir.MidIrStatement

/**
 * The control flow graph data structure.
 *
 * @param functionInstructions the function instructions as the basis of the control flow graph.
 * @param getLabel the function that returns the label if the given instruction is the label
 * instruction.
 * @param getJumpLabel the function that returns the jump label if the given instruction is the
 * jump instruction.
 * @param getConditionalJumpLabel the function that returns the first label of condition jump
 * if the given instruction is the conditional jump (fall-through) instruction.
 * @param I the type of the instruction in the control flow graph.
 */
class ControlFlowGraph<I> private constructor(
    functionInstructions: List<I>,
    getLabel: (I) -> String?,
    getJumpLabel: (I) -> String?,
    getConditionalJumpLabel: (I) -> String?,
    isReturn: (I) -> Boolean
) {
    private val nodeMap: MutableMap<Int, Node<I>>
    private val childrenMap: MutableMap<Int, List<Int>>
    private val parentMap: MutableMap<Int, MutableSet<Int>>

    init {
        nodeMap = hashMapOf()
        val labelIdMap = hashMapOf<String, Int>()
        val len = functionInstructions.size
        // first pass: construct nodeMap and labelIdMap
        for (id in 0 until len) {
            val statement = functionInstructions[id]
            nodeMap[id] = Node(id, statement)
            val label = getLabel(statement)
            if (label != null) {
                labelIdMap[label] = id
            }
        }
        childrenMap = sortedMapOf()
        // second pass: construct childrenMap
        for (id in 0 until len) {
            val statement = functionInstructions[id]
            val jumpLabel = getJumpLabel(statement)
            if (jumpLabel != null) {
                val nextId = labelIdMap[jumpLabel] ?: throw Error("Bad jump label: $jumpLabel")
                childrenMap[id] = listOf(nextId)
                continue
            }
            val conditionJumpLabel = getConditionalJumpLabel(statement)
            if (conditionJumpLabel != null) {
                val nextList = arrayListOf<Int>()
                nextList.add(labelIdMap[conditionJumpLabel]!!)
                if (id != len - 1) {
                    nextList.add(id + 1)
                }
                childrenMap[id] = nextList
                continue
            }
            if (!isReturn(statement) && id != len - 1) {
                childrenMap[id] = listOf(id + 1)
            }
        }
        // third pass: construct parentMap
        parentMap = sortedMapOf()
        for ((parentId, value) in childrenMap) {
            for (childId in value) {
                parentMap.computeIfAbsent(childId) { hashSetOf() }.add(parentId)
            }
        }
    }

    /** @return collection of all nodes. */
    val nodes: Collection<Node<I>> get() = nodeMap.values

    /** @return the start node of the graph. */
    val startNode: Node<I>
        get() = nodeMap[0] ?: throw Error("Bad list of instructions. The list should not be empty.")

    /** @return a list of nodes with no children and reachable from start node. */
    val reachableEndNodes: List<Node<I>>
        get() {
            val collector = arrayListOf<Node<I>>()
            dfs { node ->
                if (getChildrenIds(node.id).isEmpty()) {
                    collector += node
                }
            }
            return collector
        }

    /**
     * @param id the id of the node for which we want to know its children.
     * @return the children of the node with the given id.
     */
    fun getChildrenIds(id: Int): List<Int> {
        val idSet = childrenMap[id]
        return idSet ?: emptyList()
    }

    /**
     * @param id the id of the node for which we want to know its parents.
     * @return the parents of the node with the given id.
     */
    fun getParentIds(id: Int): Set<Int> {
        val idSet: Set<Int>? = parentMap[id]
        return idSet ?: emptySet()
    }

    /**
     * @param id the id of the node for which we want to know its children.
     * @return the children of the node with the given id.
     */
    fun getChildren(id: Int): List<Node<I>> {
        val idSet = childrenMap[id] ?: return emptyList()
        return idSet.map { key: Int -> nodeMap[key]!! }
    }

    fun dfs(visitor: (Node<I>) -> Unit) {
        val stack = ArrayDeque<Node<I>>()
        val visited = hashSetOf<Int>()
        val firstNode = nodeMap[0] ?: return
        stack.add(firstNode)
        while (!stack.isEmpty()) {
            val node = stack.removeLast()
            if (visited.add(node.id)) {
                visitor(node)
                stack.addAll(getChildren(node.id))
            }
        }
    }

    /**
     * One node in the graph.
     *
     * @param id ID of the node.
     * It is guaranteed that the id is exactly the order id in the original instruction list.
     * @param instruction instruction inside the node.
     * @param I the type of the instruction in the control flow graph.
     */
    data class Node<I>(val id: Int, val instruction: I)

    companion object {
        /**
         * Build a control flow graph from an IR function.
         *
         * @param functionStatements the function statements as the basis of the control flow graph.
         * The statements must be in lowered form.
         * @return the built graph.
         */
        @JvmStatic
        fun fromIr(functionStatements: List<MidIrStatement>): ControlFlowGraph<MidIrStatement> =
            ControlFlowGraph(
                functionInstructions = functionStatements,
                getLabel = { (it as? MidIrStatement.Label)?.name },
                getJumpLabel = { (it as? MidIrStatement.Jump)?.label },
                getConditionalJumpLabel = { (it as? MidIrStatement.ConditionalJumpFallThrough)?.label1 },
                isReturn = { it is MidIrStatement.Return }
            )

        /**
         * Build a control flow graph from a list of assembly instructions for a function.
         *
         * @param functionInstructions the function instructions as the basis of the control flow graph.
         * @return the built graph.
         */
        @JvmStatic
        fun fromAsm(
            functionInstructions: List<AssemblyInstruction>
        ): ControlFlowGraph<AssemblyInstruction> {
            return ControlFlowGraph(
                functionInstructions,
                { (it as? AssemblyInstruction.Label)?.label },
                { instruction ->
                    if (instruction !is JumpLabel) {
                        return@ControlFlowGraph null
                    }
                    val (type, label) = instruction
                    if (type === JumpType.JMP) label else null
                },
                { instruction ->
                    if (instruction !is JumpLabel) {
                        return@ControlFlowGraph null
                    }
                    val (type, label) = instruction
                    if (type !== JumpType.JMP) label else null
                },
                { it is AssemblyInstruction.Return }
            )
        }
    }
}
