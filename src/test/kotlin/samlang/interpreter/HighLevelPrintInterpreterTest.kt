package samlang.interpreter

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.common.ModuleReference
import samlang.common.getTypeCheckedModule
import samlang.compiler.hir.compileModule
import samlang.compiler.mir.MidIrGenerator
import samlang.programs.wellTypedTestPrograms

class HighLevelPrintInterpreterTest : StringSpec() {
    private data class TestCase(val id: String, val code: String, val expectedPrinted: String)

    private val expectations: Map<String, String> = mapOf(
        "and-or-inside-if" to "one",
        "block-in-if-else" to "",
        "builtins" to "42",
        "correct-op" to "OK",
        "different-expr-demo" to "42",
        "different-modules-demo" to "OK",
        "generic-object-test" to "2\n42",
        "map-but-ignore" to "",
        "optional-semicolon" to "-7",
        "various-syntax-forms" to "84"
    )

    private val testCases: List<TestCase> = wellTypedTestPrograms.mapNotNull { (id, _, code) ->
        val expectedPrinted = expectations[id] ?: return@mapNotNull null
        TestCase(id = id, code = code, expectedPrinted = expectedPrinted.trim())
    }

    init {
        val dummyModuleReference = ModuleReference(moduleName = "Dummy")
        for ((id, code, expectedPrinted) in testCases) {
            "printed expected value: $id" {
                val checkedProgram = getTypeCheckedModule(code = code)
                val actualProgramPrinted = ModuleInterpreter().run(module = checkedProgram).trim()
                actualProgramPrinted shouldBe expectedPrinted
                val irCompilationUnit = MidIrGenerator.generate(
                    moduleReference = dummyModuleReference,
                    module = compileModule(module = checkedProgram)
                )
                val actualIrPrinted = interpretCompilationUnit(
                    compilationUnit = irCompilationUnit,
                    entryModule = dummyModuleReference
                ).trim()
                actualIrPrinted shouldBe expectedPrinted
            }
        }
    }
}
