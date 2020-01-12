package samlang.compiler.asm.common

/** A misc utility class for assembly generation. */
internal object MiscUtil {
    /**
     * Calculates log base two of some number
     *
     * @param num the number to compute log 2. It's assumed to be a power of 2.
     */
    @JvmStatic
    fun logTwo(num: Long): Int = if (num == 1L) 0 else 1 + logTwo(num = num / 2)

    /**
     * @param num the number to check.
     * @return whether num is power of 2.
     */
    @JvmStatic
    fun isPowerOfTwo(num: Long): Boolean = num > 0 && num and num - 1 == 0L
}
