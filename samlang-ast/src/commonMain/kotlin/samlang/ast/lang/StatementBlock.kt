package samlang.ast.lang

import samlang.ast.common.Node
import samlang.ast.common.Range

data class StatementBlock(
    override val range: Range,
    val statements: List<Statement>,
    val expression: Expression?
) : Node
