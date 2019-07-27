package samlang.errors

import samlang.ast.common.Range

class SizeMismatchError private constructor(
    sizeDescription: String,
    expectedSize: Int,
    actualSize: Int,
    range: Range
) : CompileTimeError.WithRange(
    reason = "Incorrect $sizeDescription size. Expected: $expectedSize, actual: $actualSize.",
    range = range
) {

    companion object {

        @JvmStatic
        fun check(sizeDescription: String, expectedSize: Int, actualSize: Int, range: Range) {
            if (expectedSize != actualSize) {
                throw SizeMismatchError(sizeDescription, expectedSize, actualSize, range)
            }
        }

        @JvmStatic
        fun <T> checkNotNull(
            sizeDescription: String,
            expectedList: List<T>,
            actualList: List<T>,
            range: Range
        ): List<Pair<T, T>> {
            SizeMismatchError.check(
                sizeDescription = sizeDescription,
                expectedSize = expectedList.size,
                actualSize = actualList.size,
                range = range
            )
            return expectedList.zip(actualList)
        }
    }
}
