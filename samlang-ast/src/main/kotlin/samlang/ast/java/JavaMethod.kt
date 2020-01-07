package samlang.ast.java

import samlang.ast.common.Type
import samlang.ast.hir.HighIrStatement

data class JavaMethod(
    val isPublic: Boolean,
    val isStatic: Boolean,
    val name: String,
    val typeParameters: List<String>,
    val parameters: List<Pair<String, Type>>,
    val returnType: Type,
    val body: List<HighIrStatement>
)
