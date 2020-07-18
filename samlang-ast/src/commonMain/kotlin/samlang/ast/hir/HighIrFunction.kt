package samlang.ast.hir

data class HighIrFunction(
    val isPublic: Boolean,
    val isMethod: Boolean,
    val name: String,
    val parameters: List<String>,
    val hasReturn: Boolean,
    val body: List<HighIrStatement>
)
