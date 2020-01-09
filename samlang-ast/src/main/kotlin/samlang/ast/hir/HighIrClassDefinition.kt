package samlang.ast.hir

import samlang.ast.common.TypeDefinition

data class HighIrClassDefinition(
    val className: String,
    val typeDefinition: TypeDefinition,
    val members: List<HighIrFunction>
)
