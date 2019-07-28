package samlang.errors

import samlang.ast.common.Range

class TypeParamSizeMismatchError private constructor(
    expectedSize: Int,
    actualSize: Int,
    range: Range
) : CompileTimeError.WithRange(
    reason = "Incorrect number of type arguments. Expected: $expectedSize, actual: $actualSize.",
    range = range
) {

    companion object {

        @JvmStatic
        fun check(expectedSize: Int, actualSize: Int, range: Range) {
            if (expectedSize != actualSize) {
                throw TypeParamSizeMismatchError(expectedSize, actualSize, range)
            }
        }

        @JvmStatic
        fun <T> check(expectedList: List<T>, actualList: List<T>, range: Range): List<Pair<T, T>> {
            check(expectedSize = expectedList.size, actualSize = actualList.size, range = range)
            return expectedList.zip(actualList)
        }
    }
}
