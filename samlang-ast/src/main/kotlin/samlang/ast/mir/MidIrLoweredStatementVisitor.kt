package samlang.ast.mir

/**
 * The visitor for all ir statement nodes.
 * It defaults to throw exception when visiting the nodes that are supposed to be lowered.
 */
interface MidIrLoweredStatementVisitor<C, T> : MidIrStatementVisitor<C, T> {
    @JvmDefault
    override fun visit(node: MidIrStatement.IgnoreExpression, context: C): T =
        throw IllegalArgumentException("Should be lowered! node: $node")

    @JvmDefault
    override fun visit(node: MidIrStatement.Sequence, context: C): T =
        throw IllegalArgumentException("Should be lowered! node: $node")

    @JvmDefault
    override fun visit(node: MidIrStatement.ConditionalJump, context: C): T =
        throw IllegalArgumentException("Should be lowered! node: $node")
}
