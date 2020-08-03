package samlang.compiler.asm.ralloc

/**
 * A collection that is both a set and an unordered queue.
 *
 * @param E type of the elements in the queue.
 */
internal interface SetAndQueue<E> : MutableSet<E> {
    fun offer(e: E): Boolean
    fun poll(): E?
    fun remove(): E
    fun element(): E
    fun peek(): E?
}
