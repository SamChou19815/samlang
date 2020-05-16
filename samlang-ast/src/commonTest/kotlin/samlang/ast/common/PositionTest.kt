package samlang.ast.common

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PositionTest {
    @Test
    fun sameLineComparisonTest() {
        assertTrue(actual = Position(line = 1, column = 2) < Position(line = 1, column = 3))
        assertTrue(actual = Position(line = 1, column = 3) > Position(line = 1, column = 2))
        assertFalse(actual = Position(line = 1, column = 2) > Position(line = 1, column = 3))
        assertFalse(actual = Position(line = 1, column = 3) < Position(line = 1, column = 2))
        assertTrue(actual = Position(line = 1, column = 4) > Position(line = 1, column = 3))
        assertTrue(actual = Position(line = 1, column = 3) < Position(line = 1, column = 4))
        assertFalse(actual = Position(line = 1, column = 4) < Position(line = 1, column = 3))
        assertFalse(actual = Position(line = 1, column = 3) > Position(line = 1, column = 4))
    }

    @Test
    fun differentLinesComparisonTest() {
        assertTrue(actual = Position(line = 1, column = 2) < Position(line = 2, column = 3))
        assertTrue(actual = Position(line = 1, column = 3) < Position(line = 2, column = 3))
        assertTrue(actual = Position(line = 1, column = 4) < Position(line = 2, column = 3))
        assertFalse(actual = Position(line = 1, column = 2) >= Position(line = 2, column = 3))
        assertFalse(actual = Position(line = 1, column = 3) >= Position(line = 2, column = 3))
        assertFalse(actual = Position(line = 1, column = 4) >= Position(line = 2, column = 3))
    }
}
