package samlang.compiler.mir

import samlang.ast.common.GlobalVariable
import samlang.ast.common.IrNameEncoder
import samlang.ast.hir.HighIrExpression
import samlang.ast.hir.HighIrExpression.Binary
import samlang.ast.hir.HighIrExpression.IndexAccess
import samlang.ast.hir.HighIrExpression.Literal
import samlang.ast.hir.HighIrExpression.Variable
import samlang.ast.hir.HighIrExpressionVisitor
import samlang.ast.hir.HighIrStatement
import samlang.ast.hir.HighIrStatement.ClosureApplication
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
import samlang.ast.mir.MidIrExpression.Companion.EQ
import samlang.ast.mir.MidIrExpression.Companion.IMMUTABLE_MEM
import samlang.ast.mir.MidIrExpression.Companion.NAME
import samlang.ast.mir.MidIrExpression.Companion.OP
import samlang.ast.mir.MidIrExpression.Companion.ZERO
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

    private fun MALLOC(collector: MidIrExpression.Temporary, sizeExpr: MidIrExpression): MidIrStatement.CallFunction =
        CALL_FUNCTION(
            functionName = IrNameEncoder.nameOfMalloc,
            arguments = listOf(sizeExpr),
            returnCollector = collector
        )

    private inner class StatementGenerator : HighIrStatementVisitor<List<MidIrStatement>> {
        override fun visit(statement: FunctionApplication): List<MidIrStatement> {
            val statements = mutableListOf<MidIrStatement>()
            val functionArguments = statement.arguments.map { translate(expression = it) }
            statements += CALL_FUNCTION(
                    functionName = statement.functionName,
                    arguments = functionArguments,
                    returnCollector = allocator.allocateTemp(variableName = statement.resultCollector)
                )
            return statements
        }

        override fun visit(statement: ClosureApplication): List<MidIrStatement> {
            /**
             * Closure ABI:
             * {
             *    __length__: 2
             *    [0]: reference to the function
             *    [1]: context
             * }
             *
             * If context is NULL (0), then it will directly call the function like functionExpr(...restArguments).
             * If context is NONNULL, then it will call functionExpr(context, ...restArguments);
             */
            val statements = mutableListOf<MidIrStatement>()
            val arguments = statement.arguments.map { translate(expression = it) }
            val closureTemp = allocator.allocateTemp()
            val contextTemp = allocator.allocateTemp()
            val collectorTemp = allocator.allocateTemp(variableName = statement.resultCollector)
            val simpleCaseLabel = allocator.allocateLabelWithAnnotation(annotation = "CLOSURE_SIMPLE")
            val complexCaseLabel = allocator.allocateLabelWithAnnotation(annotation = "CLOSURE_COMPLEX")
            val endLabel = allocator.allocateLabelWithAnnotation(annotation = "CLOSURE_APP_END")
            statements += MOVE(destination = closureTemp, source = translate(expression = statement.functionExpression))
            statements += MOVE(destination = contextTemp, source = IMMUTABLE_MEM(ADD(e1 = closureTemp, e2 = CONST(value = 8))))
            statements += CJUMP(condition = EQ(e1 = contextTemp, e2 = ZERO), label1 = simpleCaseLabel, label2 = complexCaseLabel)
            statements += Label(name = simpleCaseLabel)
            // No context (context is null)
            statements += CALL_FUNCTION(
                expression = IMMUTABLE_MEM(expression = closureTemp),
                arguments = arguments,
                returnCollector = collectorTemp
            )
            statements += Jump(label = endLabel)
            statements += Label(name = complexCaseLabel)
            statements += CALL_FUNCTION(
                expression = IMMUTABLE_MEM(expression = closureTemp),
                arguments = mutableListOf<MidIrExpression>(contextTemp).apply { addAll(arguments) },
                returnCollector = collectorTemp
            )
            statements += Label(name = endLabel)
            return statements
        }

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
            statements += MALLOC(structTemporary, CONST(value = statement.expressionList.size * 8L))
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
        override fun visit(expression: Literal): MidIrExpression =
            when (val literal = expression.literal) {
                is samlang.ast.common.Literal.BoolLiteral -> CONST(value = if (literal.value) 1 else 0)
                is samlang.ast.common.Literal.IntLiteral -> CONST(value = literal.value)
                is samlang.ast.common.Literal.StringLiteral -> {
                    val value = literal.value
                    val contentVariable = allocator
                        .globalResourceAllocator
                        .allocateStringArrayGlobalVariable(string = value)
                    stringGlobalVariableCollector += contentVariable
                    ADD(e1 = NAME(name = contentVariable.name), e2 = EIGHT)
                }
            }

        override fun visit(expression: HighIrExpression.Name): MidIrExpression =
            NAME(name = expression.name)

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
                OP(
                    op = expression.operator,
                    e1 = translate(expression = expression.e1),
                    e2 = translate(expression = expression.e2)
                )
            )
    }
}
