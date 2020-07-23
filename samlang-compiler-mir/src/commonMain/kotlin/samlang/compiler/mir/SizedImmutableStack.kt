package samlang.compiler.mir

/**
 * The stack that keeps track of the actual size of the content.
 * This collection assumes that each element in this collection has a suitable size function.
 * And the immutable collection will report the total summed size of the elements as its own size.
 *
 * @param T type of the element in the stack.
 */
internal class SizedImmutableStack {
    private val node: Node?

    constructor() {
        this.node = null
    }

    /**
     * @param element the element to add to the stack.
     * @param prev the previous element.
     */
    private constructor(element: BasicBlock, prev: SizedImmutableStack) {
        val size = prev.size + element.statements.size
        node = Node(size, element, prev.node)
    }

    val size: Int get() = node?.size ?: 0

    operator fun plus(element: BasicBlock): SizedImmutableStack = SizedImmutableStack(element, this)

    /** @return a collection that puts the first element in the stack first. */
    fun toReversedOrderedCollection(): Collection<BasicBlock> {
        var currentNode = node
        val tempList = mutableListOf<BasicBlock>()
        while (currentNode != null) {
            tempList.add(currentNode.item)
            currentNode = currentNode.prev
        }
        return tempList
    }

    override fun toString(): String {
        val list = mutableListOf<BasicBlock>()
        var n = node
        while (n != null) {
            list.add(n.item)
            n = n.prev
        }
        return list.reverse().toString()
    }

    private data class Node(val size: Int, val item: BasicBlock, val prev: Node?)
}
