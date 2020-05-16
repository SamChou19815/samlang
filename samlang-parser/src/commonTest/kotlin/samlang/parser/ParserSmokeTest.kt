package samlang.parser

import samlang.ast.common.ModuleReference
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ParserSmokeTest {
    @Test
    fun parserCanParseCorrectPrograms() {
        val (module, errors) = buildModuleFromText(
            moduleReference = ModuleReference.ROOT,
            text = """
                class Main {
                  function main(): string = "Hello World"
                }
            """.trimIndent()
        )
        val readableErrors = errors.map { it.errorMessage }
        assertEquals(expected = emptyList(), actual = readableErrors)
        assertEquals(expected = 1, actual = module.classDefinitions.size)
    }

    @Test
    fun parserCanDetectErrors() {
        val (_, errors) = buildModuleFromText(
            moduleReference = ModuleReference.ROOT,
            text = """
                class Main {
                  function main(): string =
                }
            """.trimIndent()
        )
        assertTrue(actual = errors.isNotEmpty())
    }
}
