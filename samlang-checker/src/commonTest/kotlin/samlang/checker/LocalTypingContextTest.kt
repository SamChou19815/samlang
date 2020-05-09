package samlang.checker

import io.kotlintest.fail
import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.common.Type

class LocalTypingContextTest : StringSpec() {
    init {
        "Can find conflicts" {
            val context = LocalTypingContext()
            context.addLocalValueType(name = "a", type = Type.int) {
                fail(msg = "Should have no conflicts!")
            }
            var hasConflict = false
            context.addLocalValueType(name = "a", type = Type.int) {
                hasConflict = true
            }
            hasConflict shouldBe true
        }
        "Can compute captured values correctly." {
            val context = LocalTypingContext()
            context.addLocalValueType(name = "a", type = Type.int) { fail(msg = "Should have no conflicts!") }
            context.addLocalValueType(name = "b", type = Type.int) { fail(msg = "Should have no conflicts!") }
            val (_, captured) = context.withNestedScopeReturnCaptured {
                context.addLocalValueType(name = "c", type = Type.int) { fail(msg = "Should have no conflicts!") }
                context.addLocalValueType(name = "d", type = Type.int) { fail(msg = "Should have no conflicts!") }
                context.getLocalValueType(name = "a")
                val (_, captured) = context.withNestedScopeReturnCaptured {
                    context.getLocalValueType(name = "a")
                    context.getLocalValueType(name = "b")
                    context.getLocalValueType(name = "d")
                }
                captured.keys shouldBe setOf("a", "b", "d")
            }
            captured.keys shouldBe setOf("a", "b")
        }
    }
}
