package samlang.interpreter

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.checker.typeCheck
import samlang.parser.SourceBuilder
import samlang.programs.testPrograms

class InterpreterTest : StringSpec() {

    private data class TestCase(val id: String, val code: String, val expectedResult: Value)

    private val expectations: Map<String, Value> = mapOf(
        "simple-no-ctx" to Value.UnitValue,
        "simple-no-ctx-annotated" to Value.UnitValue,
        "hello-world" to Value.StringValue(value = "Hello World!")
    )

    private val testCases: List<TestCase> = testPrograms
        .filter { it.errorSet.isEmpty() }
        .mapNotNull { (id, _, code) ->
            val exp = expectations[id] ?: return@mapNotNull null
            TestCase(id, code, exp)
        }

    init {
        for ((id, code, expectedValue) in testCases) {
            "interpreter expected value: $id" {
                val checkedProgram = SourceBuilder.buildSourceFromText(text = code).typeCheck()
                val v = SourceInterpreter.eval(source = checkedProgram)
                v shouldBe expectedValue
            }
        }
    }
}
