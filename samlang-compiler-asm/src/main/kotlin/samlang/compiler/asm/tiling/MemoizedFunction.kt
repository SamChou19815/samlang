package samlang.compiler.asm.tiling

/** The utility class used to memoize function application. */
internal class MemoizedFunction<T, R> private constructor(private val function: (T) -> R) : (T) -> R {
    /** The memoized results.  */
    private val memoizedIO: MutableMap<T, R> = hashMapOf()

    override fun invoke(p1: T): R {
        val output = memoizedIO[p1]
        if (output != null) {
            return output
        }
        val freshOutput = function(p1)
        memoizedIO[p1] = freshOutput
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
        @JvmStatic
        fun <T, R> memo(function: (T) -> R): (T) -> R = MemoizedFunction(function)
    }
}
