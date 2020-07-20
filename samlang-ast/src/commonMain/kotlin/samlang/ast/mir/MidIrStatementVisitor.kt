package samlang.ast.mir

interface MidIrStatementVisitor<C, T> {
    fun visit(node: MidIrStatement.MoveTemp, context: C): T
    fun visit(node: MidIrStatement.MoveMem, context: C): T
    fun visit(node: MidIrStatement.CallFunction, context: C): T
    fun visit(node: MidIrStatement.Jump, context: C): T
    fun visit(node: MidIrStatement.ConditionalJump, context: C): T
    fun visit(node: MidIrStatement.ConditionalJumpFallThrough, context: C): T
    fun visit(node: MidIrStatement.Label, context: C): T
    fun visit(node: MidIrStatement.Return, context: C): T
}
