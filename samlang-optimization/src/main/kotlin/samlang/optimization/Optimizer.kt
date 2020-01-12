package samlang.optimization

/** @param T the type of instructions to optimize. */
interface Optimizer<T> {
    fun optimize(source: T): T

    companion object {
        @JvmStatic
        fun <T> getNoOpOptimizer(): Optimizer<T> = object : Optimizer<T> {
            override fun optimize(source: T): T = source
        }
    }
}
