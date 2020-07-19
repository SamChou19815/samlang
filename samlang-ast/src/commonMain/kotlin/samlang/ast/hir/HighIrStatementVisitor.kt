package samlang.ast.hir

/**
 * Generic visitor for IR statement node.
 * Each method requires a specific node to produce a result of type T.
 *
 * @param T type of the visitor return value.
 */
interface HighIrStatementVisitor<T> {
    fun visit(statement: HighIrStatement.Throw): T
    fun visit(statement: HighIrStatement.IfElse): T
    fun visit(statement: HighIrStatement.Match): T
    fun visit(statement: HighIrStatement.LetDefinition): T
    fun visit(statement: HighIrStatement.ExpressionAsStatement): T
    fun visit(statement: HighIrStatement.Return): T
}
