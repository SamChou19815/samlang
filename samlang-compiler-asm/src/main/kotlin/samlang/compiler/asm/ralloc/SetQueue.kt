package samlang.compiler.asm.ralloc

/**
 * A HashSet based queue. Order is not defined.
 *
 * @param E type of the elements in the queue.
 */
internal class SetQueue<E> : Collection<E> {
    private val set: MutableSet<E> = mutableSetOf()

    override fun isEmpty(): Boolean = set.isEmpty()

    override val size: Int get() = set.size

    fun add(element: E): Boolean = set.add(element = element)

    override fun contains(element: E): Boolean = set.contains(element = element)

    override fun containsAll(elements: Collection<E>): Boolean = set.containsAll(elements)

    fun remove(element: E): Boolean = set.remove(element = element)

    fun poll(): E? {
        val element = set.firstOrNull() ?: return null
        remove(element)
        return element
    }

    override fun iterator(): Iterator<E> = set.iterator()
}
