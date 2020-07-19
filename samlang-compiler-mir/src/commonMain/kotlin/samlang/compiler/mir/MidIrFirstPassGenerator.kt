package samlang.compiler.mir

import samlang.ast.common.BinaryOperator
import samlang.ast.common.BuiltInFunctionName
import samlang.ast.common.GlobalVariable
import samlang.ast.common.ModuleReference
import samlang.ast.common.UnaryOperator
import samlang.ast.hir.HighIrExpression
import samlang.ast.hir.HighIrExpression.Binary
import samlang.ast.hir.HighIrExpression.BuiltInFunctionApplication
import samlang.ast.hir.HighIrExpression.ClassMember
import samlang.ast.hir.HighIrExpression.IndexAccess
import samlang.ast.hir.HighIrExpression.Lambda
import samlang.ast.hir.HighIrExpression.Literal
import samlang.ast.hir.HighIrExpression.MethodAccess
import samlang.ast.hir.HighIrExpression.StructConstructor
import samlang.ast.hir.HighIrExpression.Unary
import samlang.ast.hir.HighIrExpression.Variable
import samlang.ast.hir.HighIrExpressionVisitor
import samlang.ast.hir.HighIrModule
import samlang.ast.hir.HighIrStatement
import samlang.ast.hir.HighIrStatement.ClosureApplication
import samlang.ast.hir.HighIrStatement.ExpressionAsStatement
import samlang.ast.hir.HighIrStatement.FunctionApplication
import samlang.ast.hir.HighIrStatement.IfElse
import samlang.ast.hir.HighIrStatement.LetDefinition
import samlang.ast.hir.HighIrStatement.Match
import samlang.ast.hir.HighIrStatement.Return
import samlang.ast.hir.HighIrStatement.Throw
import samlang.ast.hir.HighIrStatementVisitor
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Companion.ADD
import samlang.ast.mir.MidIrExpression.Companion.CALL
import samlang.ast.mir.MidIrExpression.Companion.CONST
import samlang.ast.mir.MidIrExpression.Companion.EIGHT
import samlang.ast.mir.MidIrExpression.Companion.EQ
import samlang.ast.mir.MidIrExpression.Companion.ESEQ
import samlang.ast.mir.MidIrExpression.Companion.IMMUTABLE_MEM
import samlang.ast.mir.MidIrExpression.Companion.MALLOC
import samlang.ast.mir.MidIrExpression.Companion.NAME
import samlang.ast.mir.MidIrExpression.Companion.ONE
import samlang.ast.mir.MidIrExpression.Companion.OP
import samlang.ast.mir.MidIrExpression.Companion.SUB
import samlang.ast.mir.MidIrExpression.Companion.XOR
import samlang.ast.mir.MidIrExpression.Companion.ZERO
import samlang.ast.mir.MidIrFunction
import samlang.ast.mir.MidIrNameEncoder
import samlang.ast.mir.MidIrOperator
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.Companion.CALL_FUNCTION
import samlang.ast.mir.MidIrStatement.Companion.CJUMP
import samlang.ast.mir.MidIrStatement.Companion.EXPR
import samlang.ast.mir.MidIrStatement.Companion.MOVE
import samlang.ast.mir.MidIrStatement.Companion.MOVE_IMMUTABLE_MEM
import samlang.ast.mir.MidIrStatement.Companion.SEQ
import samlang.ast.mir.MidIrStatement.Jump
import samlang.ast.mir.MidIrStatement.Label

/** Generate non-canonical mid IR in the first pass. */
internal class MidIrFirstPassGenerator(
    private val allocator: MidIrResourceAllocator,
    private val moduleReference: ModuleReference,
    private val module: HighIrModule
) {
    private val statementGenerator: StatementGenerator = StatementGenerator()
    private val expressionGenerator: ExpressionGenerator = ExpressionGenerator()

    private val stringGlobalVariableCollector: MutableSet<GlobalVariable> = LinkedHashSet()
    private val lambdaFunctionsCollector: MutableList<MidIrFunction> = mutableListOf()

    val stringGlobalVariables: Set<GlobalVariable> get() = stringGlobalVariableCollector
    val emittedLambdaFunctions: List<MidIrFunction> get() = lambdaFunctionsCollector

    fun translate(statement: HighIrStatement): MidIrStatement = statement.accept(visitor = statementGenerator)

    private fun translate(expression: HighIrExpression): MidIrExpression =
        expression.accept(visitor = expressionGenerator)

    private fun getFunctionName(className: String, functionName: String): String =
        MidIrNameEncoder.encodeFunctionName(
            moduleReference = getModuleOfClass(className = className),
            className = className,
            functionName = functionName
        )

    private fun getModuleOfClass(className: String): ModuleReference = module
        .imports
        .mapNotNull { oneImport ->
            if (oneImport.importedMembers.any { it.first == className }) oneImport.importedModule else null
        }
        .firstOrNull()
        ?: this.moduleReference

    private fun cJumpTranslate(
        expression: HighIrExpression,
        trueLabel: String,
        falseLabel: String,
        statementCollector: MutableList<MidIrStatement>
    ) {
        if (expression is Literal) {
            if ((expression.literal as samlang.ast.common.Literal.BoolLiteral).value) {
                statementCollector.add(Jump(trueLabel))
            } else {
                statementCollector.add(Jump(falseLabel))
            }
            return
        }
        if (expression is Binary) {
            val (e1, op, e2) = expression
            val freshLabel = allocator.allocateLabel()
            when (op) {
                BinaryOperator.AND -> {
                    cJumpTranslate(e1, freshLabel, falseLabel, statementCollector)
                    statementCollector.add(Label(freshLabel))
                    cJumpTranslate(e2, trueLabel, falseLabel, statementCollector)
                    return
                }
                BinaryOperator.OR -> {
                    cJumpTranslate(e1, trueLabel, freshLabel, statementCollector)
                    statementCollector.add(Label(freshLabel))
                    cJumpTranslate(e2, trueLabel, falseLabel, statementCollector)
                    return
                }
                else -> Unit
            }
        }
        statementCollector += CJUMP(
            condition = translate(expression = expression),
            label1 = trueLabel,
            label2 = falseLabel
        )
    }

    private inner class StatementGenerator : HighIrStatementVisitor<MidIrStatement> {
        override fun visit(statement: Throw): MidIrStatement = CALL_FUNCTION(
            functionName = MidIrNameEncoder.nameOfThrow,
            arguments = listOf(translate(expression = statement.expression)),
            returnCollector = null
        )

        override fun visit(statement: FunctionApplication): MidIrStatement =
            CALL_FUNCTION(
                functionName = getFunctionName(className = statement.className, functionName = statement.functionName),
                arguments = statement.arguments.map { translate(expression = it) },
                returnCollector = allocator.allocateTemp(variableName = statement.resultCollector)
            )

        override fun visit(statement: ClosureApplication): MidIrStatement {
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
            cJumpTranslate(
                expression = statement.booleanExpression,
                trueLabel = ifBranchLabel,
                falseLabel = elseBranchLabel,
                statementCollector = sequence
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

        override fun visit(statement: ExpressionAsStatement): MidIrStatement =
            EXPR(expression = translate(expression = statement.expressionWithPotentialSideEffect))

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

        override fun visit(expression: ClassMember): MidIrExpression {
            val name = getFunctionName(className = expression.className, functionName = expression.memberName)
            val closureTemporary = allocator.allocateTemp()
            val statements = listOf(
                MOVE(closureTemporary, MALLOC(CONST(value = 16L))),
                MOVE_IMMUTABLE_MEM(destination = IMMUTABLE_MEM(expression = closureTemporary), source = NAME(name = name)),
                MOVE_IMMUTABLE_MEM(
                    destination = IMMUTABLE_MEM(expression = ADD(e1 = closureTemporary, e2 = CONST(value = 8L))),
                    source = CONST(value = 0L)
                )
            )
            return ESEQ(SEQ(statements), closureTemporary)
        }

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

        override fun visit(expression: MethodAccess): MidIrExpression {
            val name = getFunctionName(className = expression.className, functionName = expression.methodName)
            val closureTemporary = allocator.allocateTemp()
            val statements = listOf(
                MOVE(closureTemporary, MALLOC(CONST(value = 16L))),
                MOVE_IMMUTABLE_MEM(destination = IMMUTABLE_MEM(expression = closureTemporary), source = NAME(name = name)),
                MOVE_IMMUTABLE_MEM(
                    destination = IMMUTABLE_MEM(expression = ADD(e1 = closureTemporary, e2 = CONST(value = 8L))),
                    source = translate(expression = expression.expression)
                )
            )
            return ESEQ(SEQ(statements), closureTemporary)
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

        override fun visit(expression: BuiltInFunctionApplication): MidIrExpression = CALL(
            functionExpr = NAME(
                name = when (expression.functionName) {
                    BuiltInFunctionName.STRING_TO_INT -> MidIrNameEncoder.nameOfStringToInt
                    BuiltInFunctionName.INT_TO_STRING -> MidIrNameEncoder.nameOfIntToString
                    BuiltInFunctionName.PRINTLN -> MidIrNameEncoder.nameOfPrintln
                }
            ),
            args = listOf(translate(expression = expression.argument))
        )

        override fun visit(expression: Binary): MidIrExpression {
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
                BinaryOperator.AND -> MidIrOperator.AND
                BinaryOperator.OR -> MidIrOperator.OR
                BinaryOperator.CONCAT -> {
                    return CALL(
                        functionExpr = NAME(MidIrNameEncoder.nameOfStringConcat),
                        args = listOf(translate(expression.e1), translate(expression.e2))
                    )
                }
            }
            val e1 = translate(expression = expression.e1)
            val e2 = translate(expression = expression.e2)
            return OP(op = operator, e1 = e1, e2 = e2)
        }

        override fun visit(expression: Lambda): MidIrExpression {
            val capturedVariables = expression.captured
            val statements = mutableListOf<MidIrStatement>()
            val contextValue = if (capturedVariables.isNotEmpty()) {
                val contextTemp = allocator.allocateTemp()
                statements += MOVE(contextTemp, MALLOC(sizeExpr = CONST(value = capturedVariables.size * 8L)))
                capturedVariables.forEachIndexed { index, variable ->
                    statements += MOVE_IMMUTABLE_MEM(
                        destination = IMMUTABLE_MEM(expression = ADD(e1 = contextTemp, e2 = CONST(value = index * 8L))),
                        source = allocator.getTemporaryByVariable(variableName = variable)
                    )
                }
                contextTemp
            } else {
                ONE // A dummy value that is not zero
            }
            val lambdaContextTemp = allocator.allocateTemp(variableName = "_context")
            val lambdaArguments = mutableListOf(lambdaContextTemp).apply {
                addAll(elements = expression.parameters.map { allocator.allocateTemp(variableName = it) })
            }
            val lambdaStatements = mutableListOf<MidIrStatement>()
            capturedVariables.forEachIndexed { index, variable ->
                lambdaStatements += MOVE(
                    destination = allocator.allocateTemp(variableName = variable),
                    source = IMMUTABLE_MEM(expression = ADD(e1 = lambdaContextTemp, e2 = CONST(value = index * 8L)))
                )
            }
            expression.body.forEach { lambdaStatements += translate(statement = it) }
            val lambdaName = allocator.globalResourceAllocator.allocateLambdaFunctionName()
            val lambdaFunction = MidIrFunction(
                functionName = lambdaName,
                argumentTemps = lambdaArguments,
                mainBodyStatements = lambdaStatements,
                numberOfArguments = lambdaArguments.size,
                hasReturn = expression.hasReturn,
                isPublic = false
            )
            lambdaFunctionsCollector += lambdaFunction
            val closureTemporary = allocator.allocateTemp()
            statements += MOVE(closureTemporary, MALLOC(CONST(value = 16L)))
            statements += MOVE_IMMUTABLE_MEM(
                destination = IMMUTABLE_MEM(expression = closureTemporary),
                source = NAME(name = lambdaName)
            )
            statements += MOVE_IMMUTABLE_MEM(
                destination = IMMUTABLE_MEM(expression = ADD(e1 = closureTemporary, e2 = CONST(value = 8L))),
                source = contextValue
            )
            return ESEQ(SEQ(statements), closureTemporary)
        }
    }
}
