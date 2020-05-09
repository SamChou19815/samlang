package samlang.optimization

@ExperimentalStdlibApi
val COPY_OPT: IrCompilationUnitOptimizer = IrCompilationUnitOptimizer(
    statementOptimizer = MidIrStatementOptimizer.get(
        doesPerformCopyPropagation = true,
        doesPerformLocalValueNumbering = false,
        doesPerformCommonSubExpressionElimination = false,
        doesPerformDeadCodeElimination = false
    ),
    doesPerformInlining = false
)

@ExperimentalStdlibApi
val VN_OPT: IrCompilationUnitOptimizer = IrCompilationUnitOptimizer(
    statementOptimizer = MidIrStatementOptimizer.get(
        doesPerformCopyPropagation = false,
        doesPerformLocalValueNumbering = true,
        doesPerformCommonSubExpressionElimination = false,
        doesPerformDeadCodeElimination = false
    ),
    doesPerformInlining = false
)

@ExperimentalStdlibApi
val CSE_OPT: IrCompilationUnitOptimizer = IrCompilationUnitOptimizer(
    statementOptimizer = MidIrStatementOptimizer.get(
        doesPerformCopyPropagation = false,
        doesPerformLocalValueNumbering = false,
        doesPerformCommonSubExpressionElimination = true,
        doesPerformDeadCodeElimination = false
    ),
    doesPerformInlining = false
)

@ExperimentalStdlibApi
val DCE_OPT: IrCompilationUnitOptimizer = IrCompilationUnitOptimizer(
    statementOptimizer = MidIrStatementOptimizer.get(
        doesPerformCopyPropagation = false,
        doesPerformLocalValueNumbering = false,
        doesPerformCommonSubExpressionElimination = false,
        doesPerformDeadCodeElimination = true
    ),
    doesPerformInlining = false
)

@ExperimentalStdlibApi
val INL_OPT: IrCompilationUnitOptimizer = IrCompilationUnitOptimizer(
    statementOptimizer = MidIrStatementOptimizer.get(
        doesPerformCopyPropagation = false,
        doesPerformLocalValueNumbering = false,
        doesPerformCommonSubExpressionElimination = false,
        doesPerformDeadCodeElimination = false
    ),
    doesPerformInlining = true
)

@ExperimentalStdlibApi
val ALL_OPT: IrCompilationUnitOptimizer = IrCompilationUnitOptimizer(
    statementOptimizer = MidIrStatementOptimizer.allEnabled,
    doesPerformInlining = true
)
