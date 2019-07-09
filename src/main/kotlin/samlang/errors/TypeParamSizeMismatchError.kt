package samlang.errors

import samlang.ast.Range

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
        fun <T> checkNotNull(expectedList: List<T>, actualList: List<T>, range: Range): List<Pair<T, T>> {
            check(expectedSize = expectedList.size, actualSize = actualList.size, range = range)
            return expectedList.zip(actualList)
        }

        @JvmStatic
        fun <T> check(expectedList: List<T>?, actualList: List<T>?, range: Range): List<Pair<T, T>>? =
            if (expectedList == null && actualList == null) {
                null
            } else if (expectedList == null && actualList != null) {
                throw TypeParamSizeMismatchError(expectedSize = 0, actualSize = actualList.size, range = range)
            } else if (expectedList != null && actualList == null) {
                throw TypeParamSizeMismatchError(expectedSize = expectedList.size, actualSize = 0, range = range)
            } else if (expectedList != null && actualList != null) {
                checkNotNull(expectedList, actualList, range)
            } else error(message = "Impossible Case")

    }

}
