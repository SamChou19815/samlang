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
import samlang.optimization.IrCompilationUnitOptimizer
import samlang.optimization.MidIrStatementOptimizer
import samlang.optimization.Optimizer
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
                    ModuleReference(moduleName = id) to compileModule(
                        moduleReference = ModuleReference(moduleName = id),
                        module = module
                    )
                }.toMap()
            )
        ).moduleMappings
        programTestCases.map { (id, _, expected) ->
            val ir = irSources[ModuleReference(moduleName = id)] ?: error(message = "Missing $id in compiled output!")
            TestCase(id = id, module = ir, expected = expected)
        }
    }

    private val allOptimizer: IrCompilationUnitOptimizer = IrCompilationUnitOptimizer(
        statementOptimizer = MidIrStatementOptimizer.allEnabled,
        doesPerformInlining = true
    )

    init {
        for ((id, module, expected) in programTestCases) {
            "Program: $id" { ModuleInterpreter().run(module = module).trim() shouldBe expected }
        }
        for ((id, ir, expected) in irTestCases) {
            "IR[no-opt]: $id" { testIr(ir = ir, expected = expected, optimizer = Optimizer.getNoOpOptimizer()) }
            "IR[all]: $id" { testIr(ir = ir, expected = expected, optimizer = allOptimizer) }
            "ASM[all]: $id" { testAsm(testIr(ir = ir, expected = expected, optimizer = allOptimizer), expected) }
        }
    }

    private fun testIr(
        ir: MidIrCompilationUnit,
        expected: String,
        optimizer: Optimizer<MidIrCompilationUnit>
    ): MidIrCompilationUnit {
        val optimized = optimizer.optimize(source = ir)
        try {
            interpretCompilationUnit(compilationUnit = optimized).trim() shouldBe expected
        } catch (e: PanicException) {
            System.err.println(ir)
            System.err.println()
            System.err.println(optimized)
            throw e
        }
        return optimized
    }

    private fun testAsm(irCompilationUnit: MidIrCompilationUnit, expected: String) {
        val program = AssemblyGenerator.generate(compilationUnit = irCompilationUnit)
        AssemblyInterpreter(program = program).interpretationResult.trim() shouldBe expected
    }
}
