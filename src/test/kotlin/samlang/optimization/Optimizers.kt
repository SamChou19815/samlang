package samlang.optimization

val COPY_OPT: IrCompilationUnitOptimizer = IrCompilationUnitOptimizer(
    statementOptimizer = MidIrStatementOptimizer.get(
        doesPerformCopyPropagation = true,
        doesPerformLocalValueNumbering = false,
        doesPerformCommonSubExpressionElimination = false,
        doesPerformDeadCodeElimination = false
    ),
    doesPerformInlining = false
)

val VN_OPT: IrCompilationUnitOptimizer = IrCompilationUnitOptimizer(
    statementOptimizer = MidIrStatementOptimizer.get(
        doesPerformCopyPropagation = false,
        doesPerformLocalValueNumbering = true,
        doesPerformCommonSubExpressionElimination = false,
        doesPerformDeadCodeElimination = false
    ),
    doesPerformInlining = false
)

val CSE_OPT: IrCompilationUnitOptimizer = IrCompilationUnitOptimizer(
    statementOptimizer = MidIrStatementOptimizer.get(
        doesPerformCopyPropagation = false,
        doesPerformLocalValueNumbering = false,
        doesPerformCommonSubExpressionElimination = true,
        doesPerformDeadCodeElimination = false
    ),
    doesPerformInlining = false
)

val DCE_OPT: IrCompilationUnitOptimizer = IrCompilationUnitOptimizer(
    statementOptimizer = MidIrStatementOptimizer.get(
        doesPerformCopyPropagation = false,
        doesPerformLocalValueNumbering = false,
        doesPerformCommonSubExpressionElimination = false,
        doesPerformDeadCodeElimination = true
    ),
    doesPerformInlining = false
)

val INL_OPT: IrCompilationUnitOptimizer = IrCompilationUnitOptimizer(
    statementOptimizer = MidIrStatementOptimizer.get(
        doesPerformCopyPropagation = false,
        doesPerformLocalValueNumbering = false,
        doesPerformCommonSubExpressionElimination = false,
        doesPerformDeadCodeElimination = false
    ),
    doesPerformInlining = true
)

val ALL_OPT: IrCompilationUnitOptimizer = IrCompilationUnitOptimizer(
    statementOptimizer = MidIrStatementOptimizer.allEnabled,
    doesPerformInlining = true
)
