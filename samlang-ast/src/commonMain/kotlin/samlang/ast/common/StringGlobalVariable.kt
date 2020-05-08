package samlang.ast.common

data class StringGlobalVariable(
    val referenceVariable: GlobalVariable,
    val contentVariable: GlobalVariable,
    val content: String
)
