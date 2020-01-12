package samlang.interpreter

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.common.ModuleReference
import samlang.ast.lang.Module
import samlang.ast.mir.MidIrCompilationUnit
import samlang.common.getTypeCheckedModule
import samlang.compiler.hir.compileModule
import samlang.compiler.mir.MidIrGenerator
import samlang.optimization.ALG_OPT
import samlang.optimization.ALL_OPT
import samlang.optimization.CF_OPT
import samlang.optimization.COPY_OPT
import samlang.optimization.CP_OPT
import samlang.optimization.CSE_OPT
import samlang.optimization.DCE_OPT
import samlang.optimization.INL_OPT
import samlang.optimization.Optimizer
import samlang.optimization.VN_OPT
import samlang.programs.runnableTestPrograms

class PrintInterpreterTest : StringSpec() {
    private data class TestCase(val id: String, val code: String, val expectedPrinted: String)

    private val testCases: List<TestCase> = runnableTestPrograms.map { (id, _, code) ->
        val expectedPrinted = printInterpreterExpectedResult[id] ?: error(message = "Missing result for $id.")
        TestCase(id = id, code = code, expectedPrinted = expectedPrinted.trim())
    }
    private val dummyModuleReference = ModuleReference(moduleName = "Dummy")

    init {
        for ((id, code, expectedPrinted) in testCases) {
            val module = getTypeCheckedModule(code = code)
            "program printed expected value: $id" {
                val actualProgramPrinted = ModuleInterpreter().run(module = module).trim()
                actualProgramPrinted shouldBe expectedPrinted
            }
            "[no-optimization] ir printed expected value: $id" {
                testGeneratedIrInterpretation(
                    module = module,
                    expectedPrinted = expectedPrinted,
                    optimizer = Optimizer.getNoOpOptimizer()
                )
            }
            "[cp] ir printed expected value: $id" {
                testGeneratedIrInterpretation(module = module, expectedPrinted = expectedPrinted, optimizer = CP_OPT)
            }
            "[alg] ir printed expected value: $id" {
                testGeneratedIrInterpretation(module = module, expectedPrinted = expectedPrinted, optimizer = ALG_OPT)
            }
            "[cf] ir printed expected value: $id" {
                testGeneratedIrInterpretation(module = module, expectedPrinted = expectedPrinted, optimizer = CF_OPT)
            }
            "[copy] ir printed expected value: $id" {
                testGeneratedIrInterpretation(module = module, expectedPrinted = expectedPrinted, optimizer = COPY_OPT)
            }
            "[vn] ir printed expected value: $id" {
                testGeneratedIrInterpretation(module = module, expectedPrinted = expectedPrinted, optimizer = VN_OPT)
            }
            "[cse] ir printed expected value: $id" {
                testGeneratedIrInterpretation(module = module, expectedPrinted = expectedPrinted, optimizer = CSE_OPT)
            }
            "[dce] ir printed expected value: $id" {
                testGeneratedIrInterpretation(module = module, expectedPrinted = expectedPrinted, optimizer = DCE_OPT)
            }
            "[inl] ir printed expected value: $id" {
                testGeneratedIrInterpretation(module = module, expectedPrinted = expectedPrinted, optimizer = INL_OPT)
            }
            "[all-optimizations] ir printed expected value: $id" {
                testGeneratedIrInterpretation(module = module, expectedPrinted = expectedPrinted, optimizer = ALL_OPT)
            }
        }
    }

    private fun generateIr(module: Module, optimizer: Optimizer<MidIrCompilationUnit>): MidIrCompilationUnit =
        MidIrGenerator.generate(
            moduleReference = dummyModuleReference,
            module = compileModule(module = module),
            optimizer = optimizer
        )

    private fun testGeneratedIrInterpretation(
        module: Module,
        expectedPrinted: String,
        optimizer: Optimizer<MidIrCompilationUnit>
    ) {
        val irCompilationUnit = generateIr(module = module, optimizer = optimizer)
        println(irCompilationUnit)
        val actualIrPrinted = interpretCompilationUnit(
            compilationUnit = irCompilationUnit,
            entryModule = dummyModuleReference
        ).trim()
        actualIrPrinted shouldBe expectedPrinted
    }
}
