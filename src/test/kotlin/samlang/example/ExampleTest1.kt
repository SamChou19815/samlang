package samlang.example

import io.kotlintest.data.forall
import io.kotlintest.matchers.numerics.shouldBeGreaterThan
import io.kotlintest.properties.assertAll
import io.kotlintest.specs.StringSpec
import io.kotlintest.tables.row

class ExampleTest1 : StringSpec() {

    init {
        "easy easy" {
            assertAll { v: String ->
                v.length shouldBeGreaterThan -1
            }
        }
        "my values" {
            forall(row(a = "3"), row(a = "4")) {
                it.length shouldBeGreaterThan -1
            }
        }
    }

}