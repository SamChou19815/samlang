package samlang.ast.mir

interface MidIrExpressionVisitor<C, T> {
    fun visit(node: MidIrExpression.Constant, context: C): T
    fun visit(node: MidIrExpression.Name, context: C): T
    fun visit(node: MidIrExpression.Temporary, context: C): T
    fun visit(node: MidIrExpression.Op, context: C): T
    fun visit(node: MidIrExpression.Mem, context: C): T
}
