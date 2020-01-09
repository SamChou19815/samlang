package samlang.ast.hir

import samlang.ast.common.Type

data class HighIrFunction(
    val isPublic: Boolean,
    val isMethod: Boolean,
    val name: String,
    val typeParameters: List<String>,
    val parameters: List<Pair<String, Type>>,
    val returnType: Type,
    val body: List<HighIrStatement>
)
