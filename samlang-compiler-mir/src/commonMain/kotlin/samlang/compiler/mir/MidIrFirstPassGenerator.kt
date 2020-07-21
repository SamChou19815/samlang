package samlang.compiler.mir

import samlang.ast.common.GlobalVariable
import samlang.ast.common.IrNameEncoder
import samlang.ast.hir.HighIrExpression
import samlang.ast.hir.HighIrExpression.Binary
import samlang.ast.hir.HighIrExpression.IndexAccess
import samlang.ast.hir.HighIrExpression.Variable
import samlang.ast.hir.HighIrExpressionVisitor
import samlang.ast.hir.HighIrStatement
import samlang.ast.hir.HighIrStatement.FunctionApplication
import samlang.ast.hir.HighIrStatement.IfElse
import samlang.ast.hir.HighIrStatement.LetDefinition
import samlang.ast.hir.HighIrStatement.Return
import samlang.ast.hir.HighIrStatement.StructInitialization
import samlang.ast.hir.HighIrStatementVisitor
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Companion.ADD
import samlang.ast.mir.MidIrExpression.Companion.CONST
import samlang.ast.mir.MidIrExpression.Companion.EIGHT
import samlang.ast.mir.MidIrExpression.Companion.IMMUTABLE_MEM
import samlang.ast.mir.MidIrExpression.Companion.NAME
import samlang.ast.mir.MidIrExpression.Companion.OP
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.Companion.CALL_FUNCTION
import samlang.ast.mir.MidIrStatement.Companion.CJUMP
import samlang.ast.mir.MidIrStatement.Companion.MOVE
import samlang.ast.mir.MidIrStatement.Companion.MOVE_IMMUTABLE_MEM
import samlang.ast.mir.MidIrStatement.Jump
import samlang.ast.mir.MidIrStatement.Label

/** Generate non-canonical mid IR in the first pass. */
internal class MidIrFirstPassGenerator(
    private val allocator: MidIrResourceAllocator
) {
    private val statementGenerator: StatementGenerator = StatementGenerator()
    private val expressionGenerator: ExpressionGenerator = ExpressionGenerator()

    private val stringGlobalVariableCollector: MutableSet<GlobalVariable> = LinkedHashSet()

    val stringGlobalVariables: Set<GlobalVariable> get() = stringGlobalVariableCollector

    fun translate(statement: HighIrStatement): List<MidIrStatement> = statement.accept(visitor = statementGenerator)

    private fun translate(expression: HighIrExpression): MidIrExpression =
        expression.accept(visitor = expressionGenerator)

    private inner class StatementGenerator : HighIrStatementVisitor<List<MidIrStatement>> {
        override fun visit(statement: FunctionApplication): List<MidIrStatement> =
            listOf(
                CALL_FUNCTION(
                    expression = translate(expression = statement.functionExpression),
                    arguments = statement.arguments.map { translate(expression = it) },
                    returnCollector = allocator.allocateTemp(variableName = statement.resultCollector)
                )
            )

        override fun visit(statement: IfElse): List<MidIrStatement> {
            val sequence = mutableListOf<MidIrStatement>()
            val ifBranchLabel = allocator.allocateLabelWithAnnotation(annotation = "TRUE_BRANCH")
            val elseBranchLabel = allocator.allocateLabelWithAnnotation(annotation = "FALSE_BRANCH")
            val endLabel = allocator.allocateLabelWithAnnotation(annotation = "IF_ELSE_END")
            sequence += CJUMP(
                condition = translate(expression = statement.booleanExpression),
                label1 = ifBranchLabel,
                label2 = elseBranchLabel
            )
            sequence += Label(name = ifBranchLabel)
            sequence += statement.s1.map { translate(statement = it) }.flatten()
            sequence += Jump(label = endLabel)
            sequence += Label(name = elseBranchLabel)
            sequence += statement.s2.map { translate(statement = it) }.flatten()
            sequence += Label(name = endLabel)
            return sequence
        }

        override fun visit(statement: LetDefinition): List<MidIrStatement> =
            listOf(
                MOVE(
                    destination = allocator.allocateTemp(variableName = statement.name),
                    source = translate(expression = statement.assignedExpression)
                )
            )

        override fun visit(statement: StructInitialization): List<MidIrStatement> {
            val structTemporary = allocator.allocateTemp(variableName = statement.structVariableName)
            val statements = mutableListOf<MidIrStatement>()
            statements += CALL_FUNCTION(
                functionName = IrNameEncoder.nameOfMalloc,
                arguments = listOf(CONST(value = statement.expressionList.size * 8L)),
                returnCollector = structTemporary
            )
            statement.expressionList.forEachIndexed { index, subExpression ->
                statements += MOVE_IMMUTABLE_MEM(
                    destination = IMMUTABLE_MEM(expression = ADD(e1 = structTemporary, e2 = CONST(value = index * 8L))),
                    source = translate(expression = subExpression)
                )
            }
            return statements
        }

        override fun visit(statement: Return): List<MidIrStatement> {
            val returnedExpression = statement.expression ?: return listOf(MidIrStatement.Return())
            return listOf(MidIrStatement.Return(returnedExpression = translate(returnedExpression)))
        }
    }

    private inner class ExpressionGenerator : HighIrExpressionVisitor<MidIrExpression> {
        override fun visit(expression: HighIrExpression.IntLiteral): MidIrExpression = CONST(value = expression.value)

        override fun visit(expression: HighIrExpression.StringLiteral): MidIrExpression {
            val contentVariable = allocator
                .globalResourceAllocator
                .allocateStringArrayGlobalVariable(string = expression.value)
            stringGlobalVariableCollector += contentVariable
            return ADD(e1 = NAME(name = contentVariable.name), e2 = EIGHT)
        }

        override fun visit(expression: HighIrExpression.Name): MidIrExpression = NAME(name = expression.name)

        override fun visit(expression: Variable): MidIrExpression =
            allocator.getTemporaryByVariable(variableName = expression.name)

        override fun visit(expression: IndexAccess): MidIrExpression =
            IMMUTABLE_MEM(
                expression = ADD(
                    e1 = translate(expression = expression.expression),
                    e2 = CONST(value = expression.index * 8L)
                )
            )

        override fun visit(expression: Binary): MidIrExpression =
            MidIrOpReorderingUtil.reorder(
                OP(op = expression.operator, e1 = translate(expression.e1), e2 = translate(expression.e2))
            )
    }
}
