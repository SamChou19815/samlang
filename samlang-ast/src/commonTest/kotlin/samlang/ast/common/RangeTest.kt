package samlang.ast.common

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class RangeTest {
    @Test
    fun containsTest() {
        val position = Position(line = 2, column = 2)
        val range = Range(start = Position(line = 1, column = 3), end = Position(line = 3, column = 1))
        assertTrue(actual = position in range)
    }

    @Test
    fun unionTest() {
        val range1 = Range(start = Position(line = 1, column = 3), end = Position(line = 3, column = 1))
        val range2 = Range(start = Position(line = 2, column = 3), end = Position(line = 4, column = 1))
        val expectedUnion = Range(start = Position(line = 1, column = 3), end = Position(line = 4, column = 1))
        assertEquals(expected = expectedUnion, actual = range1 union range2)
    }
}
