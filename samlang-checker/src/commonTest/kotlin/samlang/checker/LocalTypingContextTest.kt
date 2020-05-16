package samlang.checker

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail
import samlang.ast.common.Type

class LocalTypingContextTest {
    @Test
    fun canFindConflicts() {
        val context = LocalTypingContext()
        context.addLocalValueType(name = "a", type = Type.int) {
            fail(message = "Should have no conflicts!")
        }
        var hasConflict = false
        context.addLocalValueType(name = "a", type = Type.int) {
            hasConflict = true
        }
        assertTrue(actual = hasConflict)
    }

    @Test
    fun canComputedCapturedValues() {
        val context = LocalTypingContext()
        context.addLocalValueType(name = "a", type = Type.int) { fail(message = "Should have no conflicts!") }
        context.addLocalValueType(name = "b", type = Type.int) { fail(message = "Should have no conflicts!") }
        val (_, captured) = context.withNestedScopeReturnCaptured {
            context.addLocalValueType(name = "c", type = Type.int) { fail(message = "Should have no conflicts!") }
            context.addLocalValueType(name = "d", type = Type.int) { fail(message = "Should have no conflicts!") }
            context.getLocalValueType(name = "a")
            val (_, captured) = context.withNestedScopeReturnCaptured {
                context.getLocalValueType(name = "a")
                context.getLocalValueType(name = "b")
                context.getLocalValueType(name = "d")
            }
            assertEquals(expected = setOf("a", "b", "d"), actual = captured.keys)
        }
        assertEquals(expected = setOf("a", "b"), actual = captured.keys)
    }
}
