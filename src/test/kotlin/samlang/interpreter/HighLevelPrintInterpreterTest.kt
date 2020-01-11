package samlang.interpreter

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.common.getTypeCheckedModule
import samlang.programs.wellTypedTestPrograms

class HighLevelPrintInterpreterTest : StringSpec() {
    private data class TestCase(val id: String, val code: String, val expectedPrinted: String)

    private val expectations: Map<String, String> = mapOf(
        "block-in-if-else" to "",
        "builtins" to "42",
        "different-expr-demo" to "42",
        "different-modules-demo" to "OK",
        "generic-object-test" to "2\n42",
        "map-but-ignore" to "",
        "optional-semicolon" to "-7",
        "various-syntax-forms" to "84"
    )

    private val testCases: List<TestCase> = wellTypedTestPrograms.mapNotNull { (id, _, code) ->
        val expectedPrinted = expectations[id] ?: return@mapNotNull null
        TestCase(id = id, code = code, expectedPrinted = expectedPrinted)
    }

    init {
        for ((id, code, expectedPrinted) in testCases) {
            "printed expected value: $id" {
                val checkedProgram = getTypeCheckedModule(code = code)
                val actualPrinted = ModuleInterpreter().run(module = checkedProgram)
                actualPrinted.trim() shouldBe expectedPrinted.trim()
            }
        }
    }
}
