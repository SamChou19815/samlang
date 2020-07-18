package samlang.ast.hir

data class HighIrClassDefinition(
    val className: String,
    val members: List<HighIrFunction>
)
