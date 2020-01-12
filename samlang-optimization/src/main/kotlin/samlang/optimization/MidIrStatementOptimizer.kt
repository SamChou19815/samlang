package samlang.optimization

import samlang.ast.mir.MidIrStatement

interface MidIrStatementOptimizer : Optimizer<List<MidIrStatement>> {
    object AllDisabled : MidIrStatementOptimizer {
        override fun optimize(source: List<MidIrStatement>): List<MidIrStatement> = source
    }

    companion object {
        @JvmField
        val allEnabled: MidIrStatementOptimizer = get(
            doesPerformConstantPropagation = true,
            doesPerformAlgebraicOptimization = true,
            doesPerformConstantFolding = true,
            doesPerformCopyPropagation = true,
            doesPerformLocalValueNumbering = true,
            doesPerformCommonSubExpressionElimination = true,
            doesPerformDeadCodeElimination = true
        )

        @JvmStatic
        fun get(
            doesPerformConstantPropagation: Boolean,
            doesPerformAlgebraicOptimization: Boolean,
            doesPerformConstantFolding: Boolean,
            doesPerformCopyPropagation: Boolean,
            doesPerformLocalValueNumbering: Boolean,
            doesPerformCommonSubExpressionElimination: Boolean,
            doesPerformDeadCodeElimination: Boolean
        ): MidIrStatementOptimizer = object : MidIrStatementOptimizer {
            override fun optimize(source: List<MidIrStatement>): List<MidIrStatement> {
                var optimized = source
                if (doesPerformConstantPropagation) {
                    optimized = ConstantPropagationOptimizer.optimize(optimized)
                }
                if (doesPerformAlgebraicOptimization) {
                    optimized = AlgebraicOptimizer.optimize(optimized)
                }
                if (doesPerformConstantFolding) {
                    optimized = ConstantFolder.optimize(optimized)
                }
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
                /*
                if (doesPerformDeadCodeElimination) {
                    optimized = DeadCodeEliminator.optimizeIr(optimized)
                }
                 */
                return SimpleOptimizations.optimizeIr(optimized)
            }
        }
    }
}
