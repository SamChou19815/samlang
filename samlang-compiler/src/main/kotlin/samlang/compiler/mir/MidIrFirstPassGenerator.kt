package samlang.compiler.mir

import samlang.ast.common.UnaryOperator
import samlang.ast.hir.HighIrExpression
import samlang.ast.hir.HighIrExpression.Binary
import samlang.ast.hir.HighIrExpression.ClassMember
import samlang.ast.hir.HighIrExpression.ClosureApplication
import samlang.ast.hir.HighIrExpression.FieldAccess
import samlang.ast.hir.HighIrExpression.FunctionApplication
import samlang.ast.hir.HighIrExpression.Lambda
import samlang.ast.hir.HighIrExpression.Literal
import samlang.ast.hir.HighIrExpression.MethodAccess
import samlang.ast.hir.HighIrExpression.MethodApplication
import samlang.ast.hir.HighIrExpression.ObjectConstructor
import samlang.ast.hir.HighIrExpression.Ternary
import samlang.ast.hir.HighIrExpression.This
import samlang.ast.hir.HighIrExpression.TupleConstructor
import samlang.ast.hir.HighIrExpression.Unary
import samlang.ast.hir.HighIrExpression.UnitExpression
import samlang.ast.hir.HighIrExpression.Variable
import samlang.ast.hir.HighIrExpression.VariantConstructor
import samlang.ast.hir.HighIrExpressionVisitor
import samlang.ast.hir.HighIrStatement
import samlang.ast.hir.HighIrStatement.Block
import samlang.ast.hir.HighIrStatement.ConstantDefinition
import samlang.ast.hir.HighIrStatement.IfElse
import samlang.ast.hir.HighIrStatement.LetDeclaration
import samlang.ast.hir.HighIrStatement.Match
import samlang.ast.hir.HighIrStatement.Return
import samlang.ast.hir.HighIrStatement.Throw
import samlang.ast.hir.HighIrStatement.VariableAssignment
import samlang.ast.hir.HighIrStatementVisitor
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Companion.CONST
import samlang.ast.mir.MidIrExpression.Companion.ONE
import samlang.ast.mir.MidIrExpression.Companion.SUB
import samlang.ast.mir.MidIrExpression.Companion.TEMP
import samlang.ast.mir.MidIrExpression.Companion.XOR
import samlang.ast.mir.MidIrExpression.Companion.ZERO
import samlang.ast.mir.MidIrStatement

/** Generate non-canonical mid IR in the first pass */
internal class MidIrFirstPassGenerator(private val allocator: MidIrResourceAllocator) {
    private val statementGenerator: StatementGenerator = StatementGenerator()
    private val expressionGenerator: ExpressionGenerator = ExpressionGenerator()

    fun translate(statement: HighIrStatement): MidIrStatement = statement.accept(visitor = statementGenerator)

    private fun translate(expression: HighIrExpression): MidIrExpression =
        expression.accept(visitor = expressionGenerator)

    private inner class StatementGenerator : HighIrStatementVisitor<MidIrStatement> {
        override fun visit(statement: Throw): MidIrStatement {
            TODO(reason = "NOT_IMPLEMENTED")
        }

        override fun visit(statement: IfElse): MidIrStatement {
            TODO(reason = "NOT_IMPLEMENTED")
        }

        override fun visit(statement: Match): MidIrStatement {
            TODO(reason = "NOT_IMPLEMENTED")
        }

        override fun visit(statement: LetDeclaration): MidIrStatement {
            TODO(reason = "NOT_IMPLEMENTED")
        }

        override fun visit(statement: VariableAssignment): MidIrStatement {
            TODO(reason = "NOT_IMPLEMENTED")
        }

        override fun visit(statement: ConstantDefinition): MidIrStatement {
            TODO(reason = "NOT_IMPLEMENTED")
        }

        override fun visit(statement: Return): MidIrStatement {
            TODO(reason = "NOT_IMPLEMENTED")
        }

        override fun visit(statement: Block): MidIrStatement {
            TODO(reason = "NOT_IMPLEMENTED")
        }
    }

    private inner class ExpressionGenerator : HighIrExpressionVisitor<MidIrExpression> {
        override fun visit(expression: UnitExpression): MidIrExpression = CONST(value = 0)

        override fun visit(expression: Literal): MidIrExpression =
            when (val literal = expression.literal) {
                is samlang.ast.common.Literal.BoolLiteral -> CONST(value = if (literal.value) 1 else 0)
                is samlang.ast.common.Literal.IntLiteral -> CONST(value = literal.value)
                is samlang.ast.common.Literal.StringLiteral -> TODO(reason = "NOT_IMPLEMENTED")
            }

        override fun visit(expression: Variable): MidIrExpression =
            allocator.getTemporaryByVariable(variableName = expression.name)

        override fun visit(expression: This): MidIrExpression = TEMP(id = "_this")

        override fun visit(expression: ClassMember): MidIrExpression {
            TODO(reason = "NOT_IMPLEMENTED")
        }

        override fun visit(expression: TupleConstructor): MidIrExpression {
            TODO(reason = "NOT_IMPLEMENTED")
        }

        override fun visit(expression: ObjectConstructor): MidIrExpression {
            TODO(reason = "NOT_IMPLEMENTED")
        }

        override fun visit(expression: VariantConstructor): MidIrExpression {
            TODO(reason = "NOT_IMPLEMENTED")
        }

        override fun visit(expression: FieldAccess): MidIrExpression {
            TODO(reason = "NOT_IMPLEMENTED")
        }

        override fun visit(expression: MethodAccess): MidIrExpression {
            TODO(reason = "NOT_IMPLEMENTED")
        }

        override fun visit(expression: Unary): MidIrExpression {
            val child = translate(expression = expression.expression)
            return when (expression.operator) {
                // xor(0, 1) = 1 ==> false -> true
                // xor(1, 1) = 0 ==> true -> false
                UnaryOperator.NOT -> XOR(e1 = child, e2 = ONE)
                UnaryOperator.NEG -> SUB(e1 = ZERO, e2 = child)
            }
        }

        override fun visit(expression: FunctionApplication): MidIrExpression {
            TODO(reason = "NOT_IMPLEMENTED")
        }

        override fun visit(expression: MethodApplication): MidIrExpression {
            TODO(reason = "NOT_IMPLEMENTED")
        }

        override fun visit(expression: ClosureApplication): MidIrExpression {
            TODO(reason = "NOT_IMPLEMENTED")
        }

        override fun visit(expression: Binary): MidIrExpression {
            TODO(reason = "NOT_IMPLEMENTED")
        }

        override fun visit(expression: Ternary): MidIrExpression {
            TODO(reason = "NOT_IMPLEMENTED")
        }

        override fun visit(expression: Lambda): MidIrExpression {
            TODO(reason = "NOT_IMPLEMENTED")
        }
    }
}
