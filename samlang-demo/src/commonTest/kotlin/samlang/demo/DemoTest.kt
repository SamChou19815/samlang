package samlang.demo

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class DemoTest {
    @Test
    @ExperimentalStdlibApi
    fun demoFunctionCanWork() {
        val source = """
            class Main {
              function main(): string = {
                val _ = println("test");
                "Hello World"
              }
            }
        """.trimIndent()
        val result = runDemo(programString = source)
        assertEquals(expected = 0, actual = result.errors.size)
        assertEquals(expected = "\"Hello World\"", actual = result.interpreterResult)
        assertEquals(expected = "test\n", actual = result.interpreterPrinted)
        assertEquals(
            expected = """
                class Main {
                    function main(): string = {
                        val _: unit = println("test");
                        "Hello World"
                    }
                }
                
                
            """.trimIndent(),
            actual = result.prettyPrintedProgram
        )
    }

    @Test
    @ExperimentalStdlibApi
    fun demoFunctionCanDealWithParserErrors() {
        val result = runDemo(
            programString = """
                class Main {
                  function main(): string =
                }
            """.trimIndent()
        )
        assertTrue(actual = result.errors.isNotEmpty())
        assertEquals(expected = null, actual = result.interpreterResult)
        assertEquals(expected = null, actual = result.interpreterPrinted)
        assertEquals(expected = null, actual = result.prettyPrintedProgram)
    }

    @Test
    @ExperimentalStdlibApi
    fun demoFunctionCanDealWithTypeErrors() {
        val result = runDemo(
            programString = """
                class Main {
                  function main(): string = 42
                }
            """.trimIndent()
        )
        assertEquals(expected = 1, actual = result.errors.size)
        assertEquals(
            expected = "Program.sam:2:29-2:31: [UnexpectedType]: Expected: `string`, actual: `int`.",
            actual = result.errors[0]
        )
        assertEquals(expected = null, actual = result.interpreterResult)
        assertEquals(expected = null, actual = result.interpreterPrinted)
        assertEquals(expected = null, actual = result.prettyPrintedProgram)
        assertEquals(expected = null, actual = result.assemblyString)
    }
}
