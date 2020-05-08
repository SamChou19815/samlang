package samlang.ast.lang

import samlang.ast.common.Node
import samlang.ast.common.Range
import samlang.ast.common.Type

sealed class Statement : Node {
    data class Val(
        override val range: Range,
        val pattern: Pattern,
        val typeAnnotation: Type,
        val assignedExpression: Expression
    ) : Statement()
}
