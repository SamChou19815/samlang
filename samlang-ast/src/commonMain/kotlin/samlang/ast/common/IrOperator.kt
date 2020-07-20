package samlang.ast.common

enum class IrOperator(val displayName: String) {
    ADD(displayName = "+"),
    SUB(displayName = "-"),
    MUL(displayName = "*"),
    DIV(displayName = "/"),
    MOD(displayName = "%"),
    AND(displayName = "&"),
    OR(displayName = "|"),
    XOR(displayName = "^"),
    LT(displayName = "<"),
    GT(displayName = ">"),
    LE(displayName = "<="),
    GE(displayName = ">="),
    EQ(displayName = "=="),
    NE(displayName = "!=");
}
