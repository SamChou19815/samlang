package samlang.interpreter

import io.kotlintest.shouldBe
import io.kotlintest.specs.FreeSpec
import samlang.ast.common.ModuleReference
import samlang.ast.lang.Module
import samlang.ast.mir.MidIrCompilationUnit
import samlang.common.getTypeCheckedModule
import samlang.compiler.asm.AssemblyGenerator
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

class PrintInterpreterTest : FreeSpec() {
    private data class TestCase(val id: String, val code: String, val expectedPrinted: String)

    private val testCases: List<TestCase> = runnableTestPrograms.map { (id, _, code) ->
        val expectedPrinted = printInterpreterExpectedResult[id] ?: error(message = "Missing result for $id.")
        TestCase(id = id, code = code, expectedPrinted = expectedPrinted.trim())
    }
    private val dummyModuleReference = ModuleReference(moduleName = "Dummy")

    init {
        for ((id, code, expectedPrinted) in testCases) {
            val module = getTypeCheckedModule(code = code)
            "printed expected value: $id" - {
                "Program" {
                    val actualProgramPrinted = ModuleInterpreter().run(module = module).trim()
                    actualProgramPrinted shouldBe expectedPrinted
                }
                "IR[no-opt]" - {
                    testIr(module = module, expectedPrinted = expectedPrinted, optimizer = Optimizer.getNoOpOptimizer())
                }
                "IR[cp]" - { testIr(module = module, expectedPrinted = expectedPrinted, optimizer = CP_OPT) }
                "IR[alg]" - { testIr(module = module, expectedPrinted = expectedPrinted, optimizer = ALG_OPT) }
                "IR[cf]" - { testIr(module = module, expectedPrinted = expectedPrinted, optimizer = CF_OPT) }
                "IR[copy]" - { testIr(module = module, expectedPrinted = expectedPrinted, optimizer = COPY_OPT) }
                "IR[vn]" - { testIr(module = module, expectedPrinted = expectedPrinted, optimizer = VN_OPT) }
                "IR[cse]" - { testIr(module = module, expectedPrinted = expectedPrinted, optimizer = CSE_OPT) }
                "IR[dce]" - { testIr(module = module, expectedPrinted = expectedPrinted, optimizer = DCE_OPT) }
                "IR[inl]" - { testIr(module = module, expectedPrinted = expectedPrinted, optimizer = INL_OPT) }
                "IR[all-optimizations]" - {
                    val fullyOptimizedIr = testIr(
                        module = module,
                        expectedPrinted = expectedPrinted,
                        optimizer = ALL_OPT
                    )
                    "ASM[no-ralloc]" - {
                        /*
                        testAsm(
                            irCompilationUnit = fullyOptimizedIr,
                            expectedPrinted = expectedPrinted,
                            enableRegisterAllocation = false
                        )
                         */
                    }
                    "ASM[with-ralloc]" - {
                        /*
                        testAsm(
                            irCompilationUnit = fullyOptimizedIr,
                            expectedPrinted = expectedPrinted,
                            enableRegisterAllocation = true
                        )
                         */
                    }
                }
            }
        }
    }

    private fun generateIr(module: Module, optimizer: Optimizer<MidIrCompilationUnit>): MidIrCompilationUnit =
        MidIrGenerator.generate(
            moduleReference = dummyModuleReference,
            module = compileModule(module = module),
            optimizer = optimizer
        )

    private fun testIr(
        module: Module,
        expectedPrinted: String,
        optimizer: Optimizer<MidIrCompilationUnit>
    ): MidIrCompilationUnit {
        val irCompilationUnit = generateIr(module = module, optimizer = optimizer)
        val actualIrPrinted = interpretCompilationUnit(
            compilationUnit = irCompilationUnit,
            entryModule = dummyModuleReference
        ).trim()
        actualIrPrinted shouldBe expectedPrinted
        return irCompilationUnit
    }

    private fun testAsm(
        irCompilationUnit: MidIrCompilationUnit,
        expectedPrinted: String,
        enableRegisterAllocation: Boolean
    ) {
        val program = AssemblyGenerator.generate(
            compilationUnit = irCompilationUnit,
            enableRealRegisterAllocation = enableRegisterAllocation
        )
        val actualPrinted = AssemblyInterpreter(program = program, entryModule = dummyModuleReference)
            .interpretationResult
            .trim()
        actualPrinted shouldBe expectedPrinted
    }
}
