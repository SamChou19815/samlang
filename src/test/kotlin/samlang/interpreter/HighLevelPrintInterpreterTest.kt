package samlang.interpreter

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.common.ModuleReference
import samlang.common.getTypeCheckedModule
import samlang.compiler.hir.compileModule
import samlang.compiler.mir.MidIrGenerator
import samlang.programs.runnableTestPrograms

class HighLevelPrintInterpreterTest : StringSpec() {
    private data class TestCase(val id: String, val code: String, val expectedPrinted: String)

    private val expectations: Map<String, String> = mapOf(
        "and-or-inside-if" to "one",
        "block-in-if-else" to "",
        "builtins" to "42",
        "correct-op" to "OK",
        "different-expr-demo" to "42",
        "different-modules-demo" to "OK",
        "empty" to "",
        "evaluation-order" to (0..25).joinToString(separator = "\n"),
        "function-call-never-ignored" to "hi",
        "generic-object-test" to "2\n42",
        "if-else-consistency" to "3\n3\nOK",
        "if-else-unreachable-1" to "success",
        "if-else-unreachable-2" to "success",
        "map-but-ignore" to "",
        "math-functions" to "24\n55",
        "mutually-recursive" to "OK",
        "optional-semicolon" to "-7",
        "print-hello-world" to "Hello World!",
        "reordering-test" to "OK",
        "short-circuit-and-or" to "0\n1\nfalse\n0\n1\ntrue\n0\nfalse\n0\nfalse\n0\ntrue\n0\ntrue\n0\n1\nfalse\n" +
                "0\n1\ntrue\n0\n1\n0\n1\n0\n0\n0\n0\n0\n1\n0\n1",
        "string-global-constant" to "OK",
        "too-much-interference" to "0",
        "various-syntax-forms" to "84"
    )

    private val testCases: List<TestCase> = runnableTestPrograms.map { (id, _, code) ->
        val expectedPrinted = expectations[id] ?: error(message = "Missing result for $id.")
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
