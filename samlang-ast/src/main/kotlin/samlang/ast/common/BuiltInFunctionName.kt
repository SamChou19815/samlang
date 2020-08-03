package samlang.ast.common

enum class BuiltInFunctionName(val displayName: String) {
    STRING_TO_INT(displayName = "stringToInt"),
    INT_TO_STRING(displayName = "intToString"),
    PRINTLN(displayName = "println")
}
