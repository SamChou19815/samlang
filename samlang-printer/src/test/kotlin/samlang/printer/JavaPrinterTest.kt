package samlang.printer

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec

class JavaPrinterTest : StringSpec() {
    init {
        "Generated intrinsics matches expected one." {
            val expected = JavaPrinterTest::class.java
                .getResourceAsStream("Intrinsics.java")
                .readAllBytes()
                .let { String(it) }
            getJavaSamlangIntrinsics() shouldBe expected
        }
    }
}
