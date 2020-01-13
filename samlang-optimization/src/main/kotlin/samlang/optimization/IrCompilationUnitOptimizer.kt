package samlang.optimization

import samlang.ast.mir.MidIrCompilationUnit
import samlang.ast.mir.MidIrFunction

/**
 * The optimizer for ir compilation unit.
 *
 * @param statementOptimizer the statement optimizer to use.
 * @param doesPerformInlining whether to perform inlining.
 */
class IrCompilationUnitOptimizer(
    private val statementOptimizer: MidIrStatementOptimizer,
    private val doesPerformInlining: Boolean
) : Optimizer<MidIrCompilationUnit> {
    override fun optimize(source: MidIrCompilationUnit): MidIrCompilationUnit {
        var intermediate = source
        for (i in 0..3) {
            intermediate = optimizeAtStatementLevel(intermediate)
            if (doesPerformInlining) {
                intermediate = SimpleOptimizations.removeUnusedFunctions(
                    irCompilationUnit = InlineOptimizer.optimize(intermediate)
                )
            }
            intermediate = optimizeAtStatementLevel(intermediate)
        }
        return intermediate
    }

    private fun optimizeAtStatementLevel(compilationUnit: MidIrCompilationUnit): MidIrCompilationUnit {
        val newFunctions = arrayListOf<MidIrFunction>()
        for (oldFunction in compilationUnit.functions) {
            var statements = oldFunction.mainBodyStatements
            for (i in 0..4) {
                statements = statementOptimizer.optimize(statements)
            }
            newFunctions += oldFunction.copy(mainBodyStatements = statements)
        }
        return compilationUnit.copy(functions = newFunctions)
    }
}
