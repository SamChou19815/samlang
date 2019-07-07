package samlang.errors

import samlang.ast.common.Position

class TypeParamSizeMismatchError private constructor(
    expectedSize: Int,
    actualSize: Int,
    position: Position
) : CompileTimeError.WithPosition(
    reason = "Incorrect number of type arguments. Expected: $expectedSize, actual: $actualSize.",
    position = position
) {

    companion object {

        @JvmStatic
        fun check(expectedSize: Int, actualSize: Int, position: Position) {
            if (expectedSize != actualSize) {
                throw TypeParamSizeMismatchError(expectedSize, actualSize, position)
            }
        }

        @JvmStatic
        fun <T> checkNotNull(expectedList: List<T>, actualList: List<T>, position: Position): List<Pair<T, T>> {
            check(expectedSize = expectedList.size, actualSize = actualList.size, position = position)
            return expectedList.zip(actualList)
        }

        @JvmStatic
        fun <T> check(expectedList: List<T>?, actualList: List<T>?, position: Position): List<Pair<T, T>>? =
            if (expectedList == null && actualList == null) {
                null
            } else if (expectedList == null && actualList != null) {
                throw TypeParamSizeMismatchError(expectedSize = 0, actualSize = actualList.size, position = position)
            } else if (expectedList != null && actualList == null) {
                throw TypeParamSizeMismatchError(expectedSize = expectedList.size, actualSize = 0, position = position)
            } else if (expectedList != null && actualList != null) {
                checkNotNull(expectedList, actualList, position)
            } else error(message = "Impossible Case")

    }

}
