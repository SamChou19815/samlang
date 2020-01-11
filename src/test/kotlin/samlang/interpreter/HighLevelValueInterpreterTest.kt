package samlang.interpreter

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.common.getTypeCheckedModule
import samlang.programs.wellTypedTestPrograms

class HighLevelValueInterpreterTest : StringSpec() {
    private data class TestCase(val id: String, val code: String, val expectedResult: Value)

    private val expectations: Map<String, Value> = mapOf(
        "allowed-cyclic-classes" to Value.UnitValue,
        "block-in-if-else" to Value.UnitValue,
        "builtins" to Value.StringValue(value = "42"),
        "different-expr-demo" to Value.IntValue(value = 42),
        "different-modules-demo" to Value.IntValue(value = 3),
        "forty-two" to Value.IntValue(value = 42),
        "generic-object-test" to Value.UnitValue,
        "hello-world" to Value.StringValue(value = "Hello World!"),
        "lots-of-fields-and-methods" to Value.UnitValue,
        "map-but-ignore" to Value.UnitValue,
        "min-int" to Value.IntValue(value = Long.MIN_VALUE),
        "optional-semicolon" to Value.UnitValue,
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
        "simple-no-ctx-annotated" to Value.UnitValue,
        "various-syntax-forms" to Value.IntValue(value = 84)
    )

    private val testCases: List<TestCase> = wellTypedTestPrograms.mapNotNull { (id, _, code) ->
        val exp = expectations[id] ?: return@mapNotNull null
        TestCase(id, code, exp)
    }

    init {
        for ((id, code, expectedValue) in testCases) {
            "interpreter expected value: $id" {
                val checkedProgram = getTypeCheckedModule(code = code)
                val v = ModuleInterpreter().eval(module = checkedProgram)
                v shouldBe expectedValue
            }
        }
    }
}
