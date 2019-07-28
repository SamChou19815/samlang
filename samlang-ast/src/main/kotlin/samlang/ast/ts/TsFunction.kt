package samlang.ast.ts

import samlang.ast.common.Type

data class TsFunction(
    val shouldBeExported: Boolean,
    val name: String,
    val typeParameters: List<String>?,
    val parameters: List<Pair<String, Type>>,
    val body: List<TsStatement>
)
