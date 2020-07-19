package samlang.ast.hir

data class HighIrFunction(
    val name: String,
    val parameters: List<String>,
    val hasReturn: Boolean,
    val body: List<HighIrStatement>
)
