package samlang.compiler.asm.tiling

/** The utility class used to memoize function application. */
internal class MemoizedFunction<T, R> private constructor(private val function: (T) -> R) {
    /** The memoized results.  */
    private val memoizedIO: MutableMap<T, R> = mutableMapOf()

    operator fun invoke(parameter: T): R {
        val output = memoizedIO[parameter]
        if (output != null) {
            return output
        }
        val freshOutput = function(parameter)
        memoizedIO[parameter] = freshOutput
        return freshOutput
    }

    companion object {
        /**
         * Create a memoized version of the given function.
         *
         * @param function the function to memoize. It should be idempotent function.
         * @param T the type of the input.
         * @param R the type of the output.
         * @return the memoized version of the given function.
         */
        fun <T, R> memo(function: (T) -> R): MemoizedFunction<T, R> = MemoizedFunction(function)
    }
}
