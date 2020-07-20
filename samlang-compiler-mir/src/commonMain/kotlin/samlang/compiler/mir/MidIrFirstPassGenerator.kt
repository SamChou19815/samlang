package samlang.compiler.mir

import samlang.ast.common.GlobalVariable
import samlang.ast.hir.HighIrExpression
import samlang.ast.hir.HighIrExpression.Binary
import samlang.ast.hir.HighIrExpression.FunctionClosure
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
import samlang.ast.hir.HighIrStatement.Match
import samlang.ast.hir.HighIrStatement.Return
import samlang.ast.hir.HighIrStatementVisitor
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Companion.ADD
import samlang.ast.mir.MidIrExpression.Companion.CONST
import samlang.ast.mir.MidIrExpression.Companion.EIGHT
import samlang.ast.mir.MidIrExpression.Companion.EQ
import samlang.ast.mir.MidIrExpression.Companion.ESEQ
import samlang.ast.mir.MidIrExpression.Companion.IMMUTABLE_MEM
import samlang.ast.mir.MidIrExpression.Companion.MALLOC
import samlang.ast.mir.MidIrExpression.Companion.NAME
import samlang.ast.mir.MidIrExpression.Companion.OP
import samlang.ast.mir.MidIrExpression.Companion.ZERO
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.Companion.CALL_FUNCTION
import samlang.ast.mir.MidIrStatement.Companion.CJUMP
import samlang.ast.mir.MidIrStatement.Companion.MOVE
import samlang.ast.mir.MidIrStatement.Companion.MOVE_IMMUTABLE_MEM
import samlang.ast.mir.MidIrStatement.Companion.SEQ
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

    fun translate(statement: HighIrStatement): MidIrStatement = statement.accept(visitor = statementGenerator)

    private fun translate(expression: HighIrExpression): MidIrExpression =
        expression.accept(visitor = expressionGenerator)

    private inner class StatementGenerator : HighIrStatementVisitor<MidIrStatement> {
        override fun visit(statement: FunctionApplication): MidIrStatement =
            CALL_FUNCTION(
                functionName = statement.functionName,
                arguments = statement.arguments.map { translate(expression = it) },
                returnCollector = allocator.allocateTemp(variableName = statement.resultCollector)
            )

        override fun visit(statement: ClosureApplication): MidIrStatement {
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
            val closure = translate(expression = statement.functionExpression)
            val arguments = statement.arguments.map { translate(expression = it) }
            val contextTemp = allocator.allocateTemp()
            val collectorTemp = allocator.allocateTemp(variableName = statement.resultCollector)
            val simpleCaseLabel = allocator.allocateLabelWithAnnotation(annotation = "CLOSURE_SIMPLE")
            val complexCaseLabel = allocator.allocateLabelWithAnnotation(annotation = "CLOSURE_COMPLEX")
            val endLabel = allocator.allocateLabelWithAnnotation(annotation = "CLOSURE_APP_END")
            val statements = listOf(
                MOVE(destination = contextTemp, source = IMMUTABLE_MEM(ADD(e1 = closure, e2 = CONST(value = 8)))),
                CJUMP(condition = EQ(e1 = contextTemp, e2 = ZERO), label1 = simpleCaseLabel, label2 = complexCaseLabel),
                Label(name = simpleCaseLabel),
                // No context (context is null)
                CALL_FUNCTION(
                    expression = IMMUTABLE_MEM(expression = closure),
                    arguments = arguments,
                    returnCollector = collectorTemp
                ),
                Jump(label = endLabel),
                Label(name = complexCaseLabel),
                CALL_FUNCTION(
                    expression = IMMUTABLE_MEM(expression = closure),
                    arguments = mutableListOf<MidIrExpression>(contextTemp).apply { addAll(arguments) },
                    returnCollector = collectorTemp
                ),
                Label(name = endLabel)
            )
            return SEQ(statements = statements)
        }

        override fun visit(statement: IfElse): MidIrStatement {
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
            sequence += statement.s1.map { translate(statement = it) }
            sequence += Jump(label = endLabel)
            sequence += Label(name = elseBranchLabel)
            sequence += statement.s2.map { translate(statement = it) }
            sequence += Label(name = endLabel)
            return SEQ(statements = sequence)
        }

        override fun visit(statement: Match): MidIrStatement {
            statement.matchingList
            val matchedTemp = allocator.getTemporaryByVariable(variableName = statement.variableForMatchedExpression)
            val finalAssignedVariable = statement.assignedTemporaryVariable
            val tagTemp = allocator.allocateTemp()
            val statements = mutableListOf<MidIrStatement>()
            statements += MOVE(destination = tagTemp, source = matchedTemp)
            statements += MOVE(
                destination = allocator.allocateTemp(variableName = finalAssignedVariable),
                source = ZERO
            )
            val matchingList = statement.matchingList
            val matchBranchLabels = matchingList.map {
                allocator.allocateLabelWithAnnotation(annotation = "MATCH_BRANCH_${it.tagOrder}")
            }
            val endLabel = allocator.allocateLabelWithAnnotation(annotation = "MATCH_END")
            matchingList.forEachIndexed { index, variantPatternToStatement ->
                val dataVariable = variantPatternToStatement.dataVariable
                val currentLabel = matchBranchLabels[index]
                statements += CJUMP(
                    condition = EQ(tagTemp, CONST(variantPatternToStatement.tagOrder.toLong())),
                    label1 = currentLabel,
                    label2 = if (index < matchBranchLabels.size - 1) matchBranchLabels[index + 1] else endLabel
                )
                statements += Label(name = currentLabel)
                if (dataVariable != null) {
                    statements += MOVE(
                        destination = allocator.allocateTemp(variableName = dataVariable),
                        source = IMMUTABLE_MEM(expression = ADD(e1 = matchedTemp, e2 = CONST(value = 8)))
                    )
                }
                variantPatternToStatement.statements.forEach { statements += translate(statement = it) }
                val finalAssignedExpression = variantPatternToStatement.finalExpression
                statements += MOVE(
                    destination = allocator.getTemporaryByVariable(variableName = finalAssignedVariable),
                    source = translate(expression = finalAssignedExpression)
                )
                statements += Jump(label = endLabel)
            }
            statements += Label(name = endLabel)
            return SEQ(statements = statements)
        }

        override fun visit(statement: LetDefinition): MidIrStatement = MOVE(
            destination = allocator.allocateTemp(variableName = statement.name),
            source = translate(expression = statement.assignedExpression)
        )

        override fun visit(statement: Return): MidIrStatement =
            MidIrStatement.Return(returnedExpression = statement.expression?.let { translate(expression = it) })
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

        override fun visit(expression: Variable): MidIrExpression =
            allocator.getTemporaryByVariable(variableName = expression.name)

        override fun visit(expression: StructConstructor): MidIrExpression {
            val structTemporary = allocator.allocateTemp()
            val statements = mutableListOf<MidIrStatement>()
            statements += MOVE(structTemporary, MALLOC(CONST(value = expression.expressionList.size * 8L)))
            expression.expressionList.forEachIndexed { index, subExpression ->
                statements += MOVE_IMMUTABLE_MEM(
                    destination = IMMUTABLE_MEM(expression = ADD(e1 = structTemporary, e2 = CONST(value = index * 8L))),
                    source = translate(expression = subExpression)
                )
            }
            return ESEQ(SEQ(statements), structTemporary)
        }

        override fun visit(expression: IndexAccess): MidIrExpression =
            IMMUTABLE_MEM(
                expression = ADD(
                    e1 = translate(expression = expression.expression),
                    e2 = CONST(value = expression.index * 8L)
                )
            )

        override fun visit(expression: FunctionClosure): MidIrExpression {
            val name = expression.encodedFunctionName
            val closureTemporary = allocator.allocateTemp()
            val statements = listOf(
                MOVE(closureTemporary, MALLOC(CONST(value = 16L))),
                MOVE_IMMUTABLE_MEM(destination = IMMUTABLE_MEM(expression = closureTemporary), source = NAME(name = name)),
                MOVE_IMMUTABLE_MEM(
                    destination = IMMUTABLE_MEM(expression = ADD(e1 = closureTemporary, e2 = CONST(value = 8L))),
                    source = translate(expression = expression.closureContextExpression)
                )
            )
            return ESEQ(SEQ(statements), closureTemporary)
        }

        override fun visit(expression: Binary): MidIrExpression =
            OP(op = expression.operator, e1 = translate(expression = expression.e1), e2 = translate(expression = expression.e2))
    }
}
