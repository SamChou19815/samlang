package samlang.interpreter

import io.kotlintest.shouldBe
import io.kotlintest.specs.FreeSpec
import samlang.ast.common.ModuleReference
import samlang.ast.common.Sources
import samlang.ast.lang.Module
import samlang.ast.mir.MidIrCompilationUnit
import samlang.common.getTypeCheckedModule
import samlang.compiler.asm.AssemblyGenerator
import samlang.compiler.hir.compileModule
import samlang.compiler.mir.MidIrGenerator
import samlang.optimization.ALL_OPT
import samlang.optimization.COPY_OPT
import samlang.optimization.CSE_OPT
import samlang.optimization.DCE_OPT
import samlang.optimization.INL_OPT
import samlang.optimization.Optimizer
import samlang.optimization.VN_OPT
import samlang.programs.runnableTestPrograms

@ExperimentalStdlibApi
class PrintInterpreterTest : FreeSpec() {
    private data class TestCase<M>(val id: String, val module: M, val expected: String)

    private val programTestCases: List<TestCase<Module>> = runnableTestPrograms.map { (id, _, code) ->
        val expected = printInterpreterExpectedResult[id] ?: error(message = "Missing result for $id.")
        TestCase(id = id, module = getTypeCheckedModule(code = code), expected = expected.trim())
    }
    private val irTestCases: List<TestCase<MidIrCompilationUnit>> = kotlin.run {
        val irSources = MidIrGenerator.generateWithMultipleEntries(
            sources = Sources(
                moduleMappings = programTestCases.asSequence().map { (id, module, _) ->
                    ModuleReference(moduleName = id) to compileModule(module = module)
                }.toMap()
            )
        ).moduleMappings
        programTestCases.map { (id, _, expected) ->
            val ir = irSources[ModuleReference(moduleName = id)] ?: error(message = "Missing $id in compiled output!")
            TestCase(id = id, module = ir, expected = expected)
        }
    }

    init {
        for ((id, module, expected) in programTestCases) {
            "Program: $id" - { ModuleInterpreter().run(module = module).trim() shouldBe expected }
        }
        for ((id, ir, expected) in irTestCases) {
            "IR[no-opt]: $id" - { testIr(ir = ir, expected = expected, optimizer = Optimizer.getNoOpOptimizer()) }
            "IR[copy]: $id" - { testIr(ir = ir, expected = expected, optimizer = COPY_OPT) }
            "IR[vn]: $id" - { testIr(ir = ir, expected = expected, optimizer = VN_OPT) }
            "IR[cse]: $id" - { testIr(ir = ir, expected = expected, optimizer = CSE_OPT) }
            "IR[dce]: $id" - { testIr(ir = ir, expected = expected, optimizer = DCE_OPT) }
            "IR[inl]: $id" - { testIr(ir = ir, expected = expected, optimizer = INL_OPT) }
            "IR[all-optimizations]: $id" - {
                val fullyOptimizedIr = testIr(ir = ir, expected = expected, optimizer = ALL_OPT)
                "ASM[no-ralloc]" - {
                    testAsm(
                        irCompilationUnit = fullyOptimizedIr,
                        expected = expected,
                        enableRegisterAllocation = false
                    )
                }
                "ASM[with-ralloc]" - {
                    testAsm(
                        irCompilationUnit = fullyOptimizedIr,
                        expected = expected,
                        enableRegisterAllocation = true
                    )
                }
            }
        }
    }

    private fun testIr(
        ir: MidIrCompilationUnit,
        expected: String,
        optimizer: Optimizer<MidIrCompilationUnit>
    ): MidIrCompilationUnit {
        val optimized = optimizer.optimize(source = ir)
        interpretCompilationUnit(compilationUnit = optimized).trim() shouldBe expected
        return optimized
    }

    private fun testAsm(irCompilationUnit: MidIrCompilationUnit, expected: String, enableRegisterAllocation: Boolean) {
        val program = AssemblyGenerator.generate(
            compilationUnit = irCompilationUnit,
            enableRealRegisterAllocation = enableRegisterAllocation
        )
        AssemblyInterpreter(program = program).interpretationResult.trim() shouldBe expected
    }
}
