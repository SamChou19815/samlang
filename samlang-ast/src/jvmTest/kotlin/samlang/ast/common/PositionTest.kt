package samlang.ast.common

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec

class PositionTest : StringSpec() {
    init {
        "same line comparison works" {
            (Position(line = 1, column = 2) < Position(line = 1, column = 3)) shouldBe true
            (Position(line = 1, column = 3) > Position(line = 1, column = 2)) shouldBe true
            (Position(line = 1, column = 2) > Position(line = 1, column = 3)) shouldBe false
            (Position(line = 1, column = 3) < Position(line = 1, column = 2)) shouldBe false
            (Position(line = 1, column = 3) == Position(line = 1, column = 3)) shouldBe true
            (Position(line = 1, column = 4) > Position(line = 1, column = 3)) shouldBe true
            (Position(line = 1, column = 3) < Position(line = 1, column = 4)) shouldBe true
            (Position(line = 1, column = 4) < Position(line = 1, column = 3)) shouldBe false
            (Position(line = 1, column = 3) > Position(line = 1, column = 4)) shouldBe false
        }
        "different line comparison works" {
            (Position(line = 1, column = 2) < Position(line = 2, column = 3)) shouldBe true
            (Position(line = 1, column = 3) < Position(line = 2, column = 3)) shouldBe true
            (Position(line = 1, column = 4) < Position(line = 2, column = 3)) shouldBe true
            (Position(line = 1, column = 2) >= Position(line = 2, column = 3)) shouldBe false
            (Position(line = 1, column = 3) >= Position(line = 2, column = 3)) shouldBe false
            (Position(line = 1, column = 4) >= Position(line = 2, column = 3)) shouldBe false
        }
    }
}
