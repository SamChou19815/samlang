package samlang.compiler.mir

import samlang.ast.common.GlobalVariable
import samlang.ast.common.IrNameEncoder
import samlang.ast.hir.HighIrExpression
import samlang.ast.hir.HighIrExpression.Binary
import samlang.ast.hir.HighIrExpression.IndexAccess
import samlang.ast.hir.HighIrExpression.Literal
import samlang.ast.hir.HighIrExpression.StructConstructor
import samlang.ast.hir.HighIrExpression.Variable
import samlang.ast.hir.HighIrExpressionVisitor
import samlang.ast.hir.HighIrStatement
import samlang.ast.hir.HighIrStatement.ClosureApplication
import samlang.ast.hir.HighIrStatement.FunctionApplication
import samlang.ast.hir.HighIrStatement.IfElse
import samlang.ast.hir.HighIrStatement.LetDefinition
import samlang.ast.hir.HighIrStatement.Return
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

    private fun translate(expression: HighIrExpression): ExprSequence =
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
            val functionArguments = statement.arguments.map {
                val result = translate(expression = it)
                statements.addAll(elements = result.statements)
                result.expression
            }
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
            val closureResult = translate(expression = statement.functionExpression)
            val closure = closureResult.expression
            statements.addAll(elements = closureResult.statements)
            val arguments = statement.arguments.map {
                val result = translate(expression = it)
                statements.addAll(elements = result.statements)
                result.expression
            }
            val contextTemp = allocator.allocateTemp()
            val collectorTemp = allocator.allocateTemp(variableName = statement.resultCollector)
            val simpleCaseLabel = allocator.allocateLabelWithAnnotation(annotation = "CLOSURE_SIMPLE")
            val complexCaseLabel = allocator.allocateLabelWithAnnotation(annotation = "CLOSURE_COMPLEX")
            val endLabel = allocator.allocateLabelWithAnnotation(annotation = "CLOSURE_APP_END")

                statements += MOVE(destination = contextTemp, source = IMMUTABLE_MEM(ADD(e1 = closure, e2 = CONST(value = 8))))
                statements += CJUMP(condition = EQ(e1 = contextTemp, e2 = ZERO), label1 = simpleCaseLabel, label2 = complexCaseLabel)
                statements += Label(name = simpleCaseLabel)
                // No context (context is null)
                statements += CALL_FUNCTION(
                    expression = IMMUTABLE_MEM(expression = closure),
                    arguments = arguments,
                    returnCollector = collectorTemp
                )
                statements += Jump(label = endLabel)
                statements += Label(name = complexCaseLabel)
                statements += CALL_FUNCTION(
                    expression = IMMUTABLE_MEM(expression = closure),
                    arguments = mutableListOf<MidIrExpression>(contextTemp).apply { addAll(arguments) },
                    returnCollector = collectorTemp
                )
                statements += Label(name = endLabel)
            return statements
        }

        override fun visit(statement: IfElse): List<MidIrStatement> {
            val sequence = mutableListOf<MidIrStatement>()
            val conditionResult = translate(expression = statement.booleanExpression)
            sequence.addAll(conditionResult.statements)
            val ifBranchLabel = allocator.allocateLabelWithAnnotation(annotation = "TRUE_BRANCH")
            val elseBranchLabel = allocator.allocateLabelWithAnnotation(annotation = "FALSE_BRANCH")
            val endLabel = allocator.allocateLabelWithAnnotation(annotation = "IF_ELSE_END")
            sequence += CJUMP(
                condition = conditionResult.expression,
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

        override fun visit(statement: LetDefinition): List<MidIrStatement> {
            val result = translate(expression = statement.assignedExpression)
            return result.statements +
                MOVE(
                    destination = allocator.allocateTemp(variableName = statement.name),
                    source = result.expression
                )
        }

        override fun visit(statement: Return): List<MidIrStatement> {
            val returnedExpression = statement.expression ?: return listOf(MidIrStatement.Return())
            val result = translate(returnedExpression)
            return result.statements + MidIrStatement.Return(returnedExpression = result.expression)
        }
    }

    private inner class ExpressionGenerator : HighIrExpressionVisitor<ExprSequence> {
        override fun visit(expression: Literal): ExprSequence = ExprSequence(
            statements = emptyList(),
            expression = when (val literal = expression.literal) {
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
        )

        override fun visit(expression: HighIrExpression.Name): ExprSequence = ExprSequence(
            statements = emptyList(),
            expression = NAME(name = expression.name)
        )

        override fun visit(expression: Variable): ExprSequence = ExprSequence(
            statements = emptyList(),
            expression = allocator.getTemporaryByVariable(variableName = expression.name)
        )

        override fun visit(expression: StructConstructor): ExprSequence {
            val structTemporary = allocator.allocateTemp()
            val statements = mutableListOf<MidIrStatement>()
            statements += MALLOC(structTemporary, CONST(value = expression.expressionList.size * 8L))
            expression.expressionList.forEachIndexed { index, subExpression ->
                val sourceResult = translate(expression = subExpression)
                statements += sourceResult.statements
                statements += MOVE_IMMUTABLE_MEM(
                    destination = IMMUTABLE_MEM(expression = ADD(e1 = structTemporary, e2 = CONST(value = index * 8L))),
                    source = sourceResult.expression
                )
            }
            return ExprSequence(statements = statements, expression = structTemporary)
        }

        override fun visit(expression: IndexAccess): ExprSequence {
            val result = translate(expression = expression.expression)
            return ExprSequence(
                statements = result.statements,
                expression = IMMUTABLE_MEM(
                    expression = ADD(
                        e1 = result.expression,
                        e2 = CONST(value = expression.index * 8L)
                    )
                )
            )
        }

        override fun visit(expression: Binary): ExprSequence {
            val e1Result = translate(expression = expression.e1)
            val e2Result = translate(expression = expression.e2)
            return ExprSequence(
                statements = e1Result.statements + e2Result.statements,
                expression = MidIrOpReorderingUtil.reorder(
                    OP(op = expression.operator, e1 = e1Result.expression, e2 = e2Result.expression)
                )
            )
        }
    }

    private data class ExprSequence(val statements: List<MidIrStatement>, val expression: MidIrExpression)
}
