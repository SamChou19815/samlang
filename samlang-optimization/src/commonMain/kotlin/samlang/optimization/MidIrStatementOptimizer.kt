package samlang.optimization

import samlang.ast.mir.MidIrStatement

@ExperimentalStdlibApi
interface MidIrStatementOptimizer : Optimizer<List<MidIrStatement>> {
    object AllDisabled : MidIrStatementOptimizer {
        override fun optimize(source: List<MidIrStatement>): List<MidIrStatement> = source
    }

    companion object {
        val allEnabled: MidIrStatementOptimizer = get(
            doesPerformCopyPropagation = true,
            doesPerformLocalValueNumbering = true,
            doesPerformCommonSubExpressionElimination = true,
            doesPerformDeadCodeElimination = true
        )

        fun get(
            doesPerformCopyPropagation: Boolean,
            doesPerformLocalValueNumbering: Boolean,
            doesPerformCommonSubExpressionElimination: Boolean,
            doesPerformDeadCodeElimination: Boolean
        ): MidIrStatementOptimizer = object : MidIrStatementOptimizer {
            override fun optimize(source: List<MidIrStatement>): List<MidIrStatement> {
                var optimized = ConstantFolder.optimize(
                    statements = AlgebraicOptimizer.optimize(
                        statements = ConstantPropagationOptimizer.optimize(source)
                    )
                )
                if (doesPerformCopyPropagation) {
                    optimized = CopyPropagationOptimizer.optimize(optimized)
                }
                if (doesPerformLocalValueNumbering) {
                    optimized = SimpleOptimizations.optimizeIr(optimized)
                    optimized = LocalValueNumberingOptimizer.optimize(optimized)
                }
                if (doesPerformCommonSubExpressionElimination) {
                    optimized = CommonSubExpressionEliminator.optimize(optimized)
                }
                if (doesPerformDeadCodeElimination) {
                    optimized = DeadCodeEliminator.optimizeIr(optimized)
                }
                return SimpleOptimizations.optimizeIr(optimized)
            }
        }
    }
}
