package samlang.compiler.asm.ralloc

import java.util.Queue

/**
 * A collection that is both a set and an unordered queue.
 *
 * @param E type of the elements in the queue.
 */
internal interface SetAndQueue<E> : MutableSet<E>, Queue<E>
