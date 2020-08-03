package samlang.checker

import samlang.ast.common.Type
import samlang.ast.lang.Expression

internal interface ExpressionTypeCheckerWithContext {
    fun typeCheck(expression: Expression, expectedType: Type): Expression
}
