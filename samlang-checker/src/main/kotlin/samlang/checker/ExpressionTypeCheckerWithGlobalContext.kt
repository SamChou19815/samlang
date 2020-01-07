package samlang.checker

import samlang.ast.common.Type
import samlang.ast.lang.Expression

internal interface ExpressionTypeCheckerWithGlobalContext {
    fun typeCheck(expression: Expression, localTypingContext: LocalTypingContext, expectedType: Type): Expression
}
