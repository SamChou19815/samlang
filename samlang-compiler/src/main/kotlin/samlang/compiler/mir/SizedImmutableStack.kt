package samlang.compiler.mir

import java.util.ArrayDeque

/**
 * The stack that keeps track of the actual size of the content.
 * This collection assumes that each element in this collection has a suitable size function.
 * And the immutable collection will report the total summed size of the elements as its own size.
 *
 * @param T type of the element in the stack.
 */
internal class SizedImmutableStack<T> {
    private val getSizeFunction: (T) -> Int
    private val node: Node<T>?

    constructor(getSizeFunction: (T) -> Int) {
        this.getSizeFunction = getSizeFunction
        this.node = null
    }

    /**
     * @param element the element to add to the stack.
     * @param prev the previous element.
     */
    private constructor(element: T, prev: SizedImmutableStack<T>) {
        getSizeFunction = prev.getSizeFunction
        val size = prev.size() + getSizeFunction(element)
        node = Node(size, element, prev.node)
    }

    /**
     * @return total size of the stack.
     */
    fun size(): Int {
        return node?.size ?: 0
    }

    /**
     * @param element the element to add to the stack.
     * @return the new stack with element added.
     */
    operator fun plus(element: T): SizedImmutableStack<T> {
        return SizedImmutableStack(element, this)
    }

    /**
     * @return a collection that puts the first element in the stack first.
     */
    fun toReversedOrderedCollection(): Collection<T> {
        var currentNode = node
        val tempList = ArrayList<T>()
        while (currentNode != null) {
            tempList.add(currentNode.item)
            currentNode = currentNode.prev
        }
        return tempList
    }

    override fun toString(): String {
        val list = ArrayDeque<T>()
        var n = node
        while (n != null) {
            list.addFirst(n.item)
            n = n.prev
        }
        return list.toString()
    }

    private data class Node<T>(val size: Int, val item: T, val prev: Node<T>?)
}
