package samlang.ast.common

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec

class RangeTest : StringSpec() {
    init {
        "Range.contains() works" {
            val position = Position(line = 2, column = 2)
            val range = Range(start = Position(line = 1, column = 3), end = Position(line = 3, column = 1))
            (position in range) shouldBe true
        }
        "Range.union() works" {
            val range1 = Range(start = Position(line = 1, column = 3), end = Position(line = 3, column = 1))
            val range2 = Range(start = Position(line = 2, column = 3), end = Position(line = 4, column = 1))
            val expectedUnion = Range(start = Position(line = 1, column = 3), end = Position(line = 4, column = 1))
            (range1 union range2) shouldBe expectedUnion
        }
    }
}
