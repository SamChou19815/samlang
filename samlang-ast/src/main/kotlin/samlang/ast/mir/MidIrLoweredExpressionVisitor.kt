package samlang.ast.mir

/**
 * The visitor for all ir expression nodes.
 * It defaults to throw exception when visiting the nodes that are supposed to be lowered.
 */
interface MidIrLoweredExpressionVisitor<C, T> : MidIrExpressionVisitor<C, T> {
    @JvmDefault
    override fun visit(node: MidIrExpression.Call, context: C): T =
        throw IllegalArgumentException("Should be lowered! node: $node")

    @JvmDefault
    override fun visit(node: MidIrExpression.ExprSequence, context: C): T =
        throw IllegalArgumentException("Should be lowered! node: $node")
}
