package samlang.compiler.asm.common

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class MiscUtilTest {
    @Test
    fun log2Test() {
        assertEquals(expected = 0, actual = MiscUtil.logTwo(num = 1))
        assertEquals(expected = 1, actual = MiscUtil.logTwo(num = 2))
        assertEquals(expected = 2, actual = MiscUtil.logTwo(num = 4))
        assertEquals(expected = 3, actual = MiscUtil.logTwo(num = 8))
    }

    @Test
    fun isPowerOfTwoTest() {
        assertTrue(actual = MiscUtil.isPowerOfTwo(num = 1))
        assertTrue(actual = MiscUtil.isPowerOfTwo(num = 2))
        assertFalse(actual = MiscUtil.isPowerOfTwo(num = 3))
        assertTrue(actual = MiscUtil.isPowerOfTwo(num = 4))
        assertFalse(actual = MiscUtil.isPowerOfTwo(num = 5))
        assertFalse(actual = MiscUtil.isPowerOfTwo(num = 6))
        assertFalse(actual = MiscUtil.isPowerOfTwo(num = 7))
        assertTrue(actual = MiscUtil.isPowerOfTwo(num = 8))
    }
}
