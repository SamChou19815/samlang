package samlang.ast.ts

import samlang.ast.common.Type
import samlang.ast.ir.IrStatement

data class TsFunction(
    val shouldBeExported: Boolean,
    val name: String,
    val typeParameters: List<String>,
    val parameters: List<Pair<String, Type>>,
    val returnType: Type,
    val body: List<IrStatement>
)
