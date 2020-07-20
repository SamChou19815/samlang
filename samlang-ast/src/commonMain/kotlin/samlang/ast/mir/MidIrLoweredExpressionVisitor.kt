package samlang.ast.mir

/**
 * The visitor for all ir expression nodes.
 * It defaults to throw exception when visiting the nodes that are supposed to be lowered.
 */
interface MidIrLoweredExpressionVisitor<C, T> : MidIrExpressionVisitor<C, T>
