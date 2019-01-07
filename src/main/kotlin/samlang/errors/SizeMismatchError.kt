package samlang.errors

import samlang.parser.Position

class SizeMismatchError private constructor(
    sizeDescription: String,
    expectedSize: Int,
    actualSize: Int,
    position: Position
) : CompileTimeError.WithPosition(
    reason = "Incorrect $sizeDescription size. Expected: $expectedSize, actual: $actualSize.",
    position = position
) {

    companion object {

        @JvmStatic
        fun check(sizeDescription: String, expectedSize: Int, actualSize: Int, position: Position) {
            if (expectedSize != actualSize) {
                throw SizeMismatchError(sizeDescription, expectedSize, actualSize, position)
            }
        }

        @JvmStatic
        fun <T> checkNotNull(
            sizeDescription: String, expectedList: List<T>, actualList: List<T>, position: Position
        ): List<Pair<T, T>> {
            SizeMismatchError.check(
                sizeDescription = sizeDescription,
                expectedSize = expectedList.size,
                actualSize = actualList.size,
                position = position
            )
            return expectedList.zip(actualList)
        }

    }

}
