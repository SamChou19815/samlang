package samlang.ast.ir

/**
 * Generic visitor for IR statement node.
 * Each method requires a specific node to produce a result of type T.
 *
 * @param T type of the visitor return value.
 */
interface IrStatementVisitor<T> {
    fun visit(statement: IrStatement.Throw): T
    fun visit(statement: IrStatement.IfElse): T
    fun visit(statement: IrStatement.Match): T
    fun visit(statement: IrStatement.LetDeclaration): T
    fun visit(statement: IrStatement.VariableAssignment): T
    fun visit(statement: IrStatement.ConstantDefinition): T
    fun visit(statement: IrStatement.Return): T
}
