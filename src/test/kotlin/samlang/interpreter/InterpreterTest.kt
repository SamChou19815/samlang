package samlang.interpreter

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.common.getTypeCheckedModule
import samlang.programs.testPrograms

class InterpreterTest : StringSpec() {

    private data class TestCase(val id: String, val code: String, val expectedResult: Value)

    private val expectations: Map<String, Value> = mapOf(
        "block-in-if-else" to Value.UnitValue,
        "different-expr-demo" to Value.IntValue(value = 42),
        "forty-two" to Value.IntValue(value = 42),
        "hello-world" to Value.StringValue(value = "Hello World!"),
        "lots-of-fields-and-methods" to Value.UnitValue,
        "overengineered-hello-world" to Value.StringValue(value = "Hello World!"),
        "overengineered-hello-world2" to Value.StringValue(value = "Hello World!"),
        "polymorphic-option" to Value.VariantValue(tag = "Some", data = Value.StringValue(value = "hi")),
        "sam-in-samlang-list" to Value.ObjectValue(
            objectContent = mapOf(
                "name" to Value.StringValue(value = "Sam Zhou"),
                "github" to Value.StringValue(value = "SamChou19815"),
                "projects" to Value.VariantValue(
                    tag = "Cons",
                    data = Value.TupleValue(
                        tupleContent = listOf(
                            Value.StringValue(value = "..."),
                            Value.VariantValue(
                                tag = "Cons",
                                data = Value.TupleValue(
                                    tupleContent = listOf(
                                        Value.StringValue(value = "SAMLANG"),
                                        Value.VariantValue(tag = "Nil", data = Value.UnitValue)
                                    )
                                )
                            )
                        )
                    )
                )
            )
        ),
        "simple-no-ctx" to Value.UnitValue,
        "simple-no-ctx-annotated" to Value.UnitValue
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
                val checkedProgram = getTypeCheckedModule(code = code)
                val v = ModuleInterpreter.eval(module = checkedProgram)
                v shouldBe expectedValue
            }
        }
    }
}
