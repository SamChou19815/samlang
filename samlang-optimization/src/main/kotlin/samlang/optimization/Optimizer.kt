package samlang.optimization

/** @param T the type of instructions to optimize. */
interface Optimizer<T> {
    fun optimize(source: T): T
}
