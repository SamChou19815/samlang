package samlang.compiler.asm.ralloc

/**
 * A HashSet based queue. Order is not defined.
 *
 * @param E type of the elements in the queue.
 */
internal class SetQueue<E> : HashSet<E>(), SetAndQueue<E> {
    override fun offer(e: E): Boolean {
        add(e)
        return true
    }

    override fun remove(): E {
        val iterator: Iterator<E> = iterator()
        if (!iterator.hasNext()) {
            throw NoSuchElementException()
        }
        val element = iterator.next()
        super.remove(element)
        return element
    }

    override fun poll(): E? {
        val iterator = iterator()
        if (!iterator.hasNext()) {
            return null
        }
        val element = iterator.next()
        super.remove(element)
        return element
    }

    override fun element(): E {
        val iterator = iterator()
        if (iterator.hasNext()) {
            return iterator.next()
        }
        throw NoSuchElementException()
    }

    override fun peek(): E? {
        val iterator = iterator()
        return if (iterator.hasNext()) iterator.next() else null
    }
}
