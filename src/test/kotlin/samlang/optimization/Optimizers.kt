package samlang.optimization

val CP_OPT: IrCompilationUnitOptimizer = IrCompilationUnitOptimizer(
    statementOptimizer = MidIrStatementOptimizer.get(
        doesPerformConstantPropagation = true,
        doesPerformAlgebraicOptimization = false,
        doesPerformConstantFolding = false,
        doesPerformCopyPropagation = false,
        doesPerformLocalValueNumbering = false,
        doesPerformCommonSubExpressionElimination = false,
        doesPerformDeadCodeElimination = false
    ),
    doesPerformInlining = false
)

val ALG_OPT: IrCompilationUnitOptimizer = IrCompilationUnitOptimizer(
    statementOptimizer = MidIrStatementOptimizer.get(
        doesPerformConstantPropagation = false,
        doesPerformAlgebraicOptimization = true,
        doesPerformConstantFolding = false,
        doesPerformCopyPropagation = false,
        doesPerformLocalValueNumbering = false,
        doesPerformCommonSubExpressionElimination = false,
        doesPerformDeadCodeElimination = false
    ),
    doesPerformInlining = false
)

val CF_OPT: IrCompilationUnitOptimizer = IrCompilationUnitOptimizer(
    statementOptimizer = MidIrStatementOptimizer.get(
        doesPerformConstantPropagation = false,
        doesPerformAlgebraicOptimization = false,
        doesPerformConstantFolding = true,
        doesPerformCopyPropagation = false,
        doesPerformLocalValueNumbering = false,
        doesPerformCommonSubExpressionElimination = false,
        doesPerformDeadCodeElimination = false
    ),
    doesPerformInlining = false
)

val COPY_OPT: IrCompilationUnitOptimizer = IrCompilationUnitOptimizer(
    statementOptimizer = MidIrStatementOptimizer.get(
        doesPerformConstantPropagation = false,
        doesPerformAlgebraicOptimization = false,
        doesPerformConstantFolding = false,
        doesPerformCopyPropagation = true,
        doesPerformLocalValueNumbering = false,
        doesPerformCommonSubExpressionElimination = false,
        doesPerformDeadCodeElimination = false
    ),
    doesPerformInlining = false
)

val VN_OPT: IrCompilationUnitOptimizer = IrCompilationUnitOptimizer(
    statementOptimizer = MidIrStatementOptimizer.get(
        doesPerformConstantPropagation = false,
        doesPerformAlgebraicOptimization = false,
        doesPerformConstantFolding = false,
        doesPerformCopyPropagation = false,
        doesPerformLocalValueNumbering = true,
        doesPerformCommonSubExpressionElimination = false,
        doesPerformDeadCodeElimination = false
    ),
    doesPerformInlining = false
)

val CSE_OPT: IrCompilationUnitOptimizer = IrCompilationUnitOptimizer(
    statementOptimizer = MidIrStatementOptimizer.get(
        doesPerformConstantPropagation = false,
        doesPerformAlgebraicOptimization = false,
        doesPerformConstantFolding = false,
        doesPerformCopyPropagation = false,
        doesPerformLocalValueNumbering = false,
        doesPerformCommonSubExpressionElimination = true,
        doesPerformDeadCodeElimination = false
    ),
    doesPerformInlining = false
)

val DCE_OPT: IrCompilationUnitOptimizer = IrCompilationUnitOptimizer(
    statementOptimizer = MidIrStatementOptimizer.get(
        doesPerformConstantPropagation = false,
        doesPerformAlgebraicOptimization = false,
        doesPerformConstantFolding = false,
        doesPerformCopyPropagation = false,
        doesPerformLocalValueNumbering = false,
        doesPerformCommonSubExpressionElimination = false,
        doesPerformDeadCodeElimination = true
    ),
    doesPerformInlining = false
)

val INL_OPT: IrCompilationUnitOptimizer = IrCompilationUnitOptimizer(
    statementOptimizer = MidIrStatementOptimizer.get(
        doesPerformConstantPropagation = false,
        doesPerformAlgebraicOptimization = false,
        doesPerformConstantFolding = false,
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
