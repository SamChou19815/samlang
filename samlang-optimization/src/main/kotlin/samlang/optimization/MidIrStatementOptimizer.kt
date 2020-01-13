package samlang.optimization

import samlang.ast.mir.MidIrStatement

interface MidIrStatementOptimizer : Optimizer<List<MidIrStatement>> {
    object AllDisabled : MidIrStatementOptimizer {
        override fun optimize(source: List<MidIrStatement>): List<MidIrStatement> = source
    }

    companion object {
        @JvmField
        val allEnabled: MidIrStatementOptimizer = get(
            doesPerformCopyPropagation = true,
            doesPerformLocalValueNumbering = true,
            doesPerformCommonSubExpressionElimination = true,
            doesPerformDeadCodeElimination = true
        )

        @JvmStatic
        fun get(
            doesPerformCopyPropagation: Boolean,
            doesPerformLocalValueNumbering: Boolean,
            doesPerformCommonSubExpressionElimination: Boolean,
            doesPerformDeadCodeElimination: Boolean
        ): MidIrStatementOptimizer = object : MidIrStatementOptimizer {
            override fun optimize(source: List<MidIrStatement>): List<MidIrStatement> {
                var optimized = source
                optimized = ConstantPropagationOptimizer.optimize(optimized)
                optimized = AlgebraicOptimizer.optimize(optimized)
                optimized = ConstantFolder.optimize(optimized)
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
