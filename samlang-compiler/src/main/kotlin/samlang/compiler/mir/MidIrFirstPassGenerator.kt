package samlang.compiler.mir

import samlang.ast.common.BinaryOperator
import samlang.ast.common.GlobalVariable
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
import samlang.ast.hir.HighIrPattern
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
import samlang.ast.mir.MidIrExpression.Companion.ADD
import samlang.ast.mir.MidIrExpression.Companion.CONST
import samlang.ast.mir.MidIrExpression.Companion.ESEQ
import samlang.ast.mir.MidIrExpression.Companion.MALLOC
import samlang.ast.mir.MidIrExpression.Companion.MEM
import samlang.ast.mir.MidIrExpression.Companion.NAME
import samlang.ast.mir.MidIrExpression.Companion.ONE
import samlang.ast.mir.MidIrExpression.Companion.OP
import samlang.ast.mir.MidIrExpression.Companion.SUB
import samlang.ast.mir.MidIrExpression.Companion.TEMP
import samlang.ast.mir.MidIrExpression.Companion.XOR
import samlang.ast.mir.MidIrExpression.Companion.ZERO
import samlang.ast.mir.MidIrOperator
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.Companion.EXPR
import samlang.ast.mir.MidIrStatement.Companion.MOVE
import samlang.ast.mir.MidIrStatement.Companion.SEQ

/** Generate non-canonical mid IR in the first pass */
internal class MidIrFirstPassGenerator(private val allocator: MidIrResourceAllocator) {
    private val statementGenerator: StatementGenerator = StatementGenerator()
    private val expressionGenerator: ExpressionGenerator = ExpressionGenerator()

    private val globalVariableCollector: MutableSet<GlobalVariable> = LinkedHashSet()
    private val stringContentMapping: MutableMap<GlobalVariable, String> = hashMapOf()

    val globalVariables: Set<GlobalVariable> get() = globalVariableCollector
    val globalVariablesStringContentMapping: Map<GlobalVariable, String> get() = stringContentMapping

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

        override fun visit(statement: LetDeclaration): MidIrStatement =
            MOVE(destination = TEMP(id = statement.name), source = ZERO)

        override fun visit(statement: VariableAssignment): MidIrStatement =
            MOVE(
                destination = allocator.getTemporaryByVariable(variableName = statement.name),
                source = translate(expression = statement.assignedExpression)
            )

        override fun visit(statement: ConstantDefinition): MidIrStatement {
            val assignedExpression = translate(expression = statement.assignedExpression)
            return when (val pattern = statement.pattern) {
                is HighIrPattern.ObjectPattern -> TODO(reason = "NOT_IMPLEMENTED")
                is HighIrPattern.TuplePattern -> TODO(reason = "NOT_IMPLEMENTED")
                is HighIrPattern.VariablePattern -> MOVE(
                    destination = allocator.getTemporaryByVariable(variableName = pattern.name),
                    source = assignedExpression
                )
                is HighIrPattern.WildCardPattern -> EXPR(expression = assignedExpression)
            }
        }

        override fun visit(statement: Return): MidIrStatement =
            MidIrStatement.Return(returnedExpression = statement.expression?.let { translate(expression = it) })

        override fun visit(statement: Block): MidIrStatement =
            SEQ(statements = statement.statements.map { translate(statement = it) })
    }

    private inner class ExpressionGenerator : HighIrExpressionVisitor<MidIrExpression> {
        override fun visit(expression: UnitExpression): MidIrExpression = CONST(value = 0)

        override fun visit(expression: Literal): MidIrExpression =
            when (val literal = expression.literal) {
                is samlang.ast.common.Literal.BoolLiteral -> CONST(value = if (literal.value) 1 else 0)
                is samlang.ast.common.Literal.IntLiteral -> CONST(value = literal.value)
                is samlang.ast.common.Literal.StringLiteral -> {
                    val (referenceVariable, contentVariable) =
                        allocator.allocateStringGlobalVariable(string = literal.value)
                    globalVariableCollector += referenceVariable
                    globalVariableCollector += contentVariable
                    stringContentMapping[contentVariable] = literal.value
                    NAME(name = referenceVariable.name)
                }
            }

        override fun visit(expression: Variable): MidIrExpression =
            allocator.getTemporaryByVariable(variableName = expression.name)

        override fun visit(expression: This): MidIrExpression = TEMP(id = "_this")

        override fun visit(expression: ClassMember): MidIrExpression {
            TODO(reason = "NOT_IMPLEMENTED")
        }

        override fun visit(expression: TupleConstructor): MidIrExpression {
            val tupleTemporary = allocator.allocateTemp()
            val statements = arrayListOf<MidIrStatement>()
            statements += MOVE(tupleTemporary, MALLOC(CONST(value = expression.expressionList.size * 8L)))
            expression.expressionList.forEachIndexed { index, argument ->
                statements += MOVE(
                    destination = MEM(expression = ADD(e1 = tupleTemporary, e2 = CONST(value = index * 8L))),
                    source = translate(expression = argument)
                )
            }
            return ESEQ(SEQ(statements), tupleTemporary)
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
            val e1 = translate(expression = expression.e1)
            val e2 = translate(expression = expression.e2)
            val operator = when (expression.operator) {
                BinaryOperator.MUL -> MidIrOperator.MUL
                BinaryOperator.DIV -> MidIrOperator.DIV
                BinaryOperator.MOD -> MidIrOperator.MOD
                BinaryOperator.PLUS -> MidIrOperator.ADD
                BinaryOperator.MINUS -> MidIrOperator.SUB
                BinaryOperator.LT -> MidIrOperator.LT
                BinaryOperator.LE -> MidIrOperator.LE
                BinaryOperator.GT -> MidIrOperator.GT
                BinaryOperator.GE -> MidIrOperator.GE
                BinaryOperator.EQ -> MidIrOperator.EQ
                BinaryOperator.NE -> MidIrOperator.NE
                BinaryOperator.AND -> TODO(reason = "NOT_IMPLEMENTED")
                BinaryOperator.OR -> TODO(reason = "NOT_IMPLEMENTED")
            }
            return OP(op = operator, e1 = e1, e2 = e2)
        }

        override fun visit(expression: Ternary): MidIrExpression {
            TODO(reason = "NOT_IMPLEMENTED")
        }

        override fun visit(expression: Lambda): MidIrExpression {
            TODO(reason = "NOT_IMPLEMENTED")
        }
    }
}
