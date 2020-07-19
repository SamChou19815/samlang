package samlang.compiler.hir

import samlang.ast.common.BinaryOperator
import samlang.ast.common.IrNameEncoder
import samlang.ast.common.ModuleReference
import samlang.ast.common.Type
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
import samlang.ast.hir.HighIrStatement
import samlang.ast.hir.HighIrStatement.ClosureApplication
import samlang.ast.hir.HighIrStatement.ExpressionAsStatement
import samlang.ast.hir.HighIrStatement.FunctionApplication
import samlang.ast.hir.HighIrStatement.IfElse
import samlang.ast.hir.HighIrStatement.LetDefinition
import samlang.ast.hir.HighIrStatement.Match
import samlang.ast.hir.HighIrStatement.Return
import samlang.ast.hir.HighIrStatement.Throw
import samlang.ast.lang.Expression
import samlang.ast.lang.ExpressionVisitor
import samlang.ast.lang.Pattern
import samlang.ast.lang.Statement

internal fun lowerExpression(moduleReference: ModuleReference, expression: Expression): LoweringResult =
    expression.accept(visitor = ExpressionLoweringVisitor(moduleReference), context = Unit)

internal data class LoweringResult(val statements: List<HighIrStatement>, val expression: HighIrExpression)

private fun HighIrExpression.asLoweringResult(statements: List<HighIrStatement> = emptyList()): LoweringResult =
    LoweringResult(statements = statements, expression = this)

private fun List<HighIrStatement>.asLoweringResult(): LoweringResult =
    LoweringResult(statements = this, expression = HighIrExpression.FALSE)

private class ExpressionLoweringVisitor(private val moduleReference: ModuleReference) :
    ExpressionVisitor<Unit, LoweringResult> {

    private var nextTemporaryVariableId: Int = 0

    private fun allocateTemporaryVariable(): String {
        val variableName = "_LOWERING_$nextTemporaryVariableId"
        nextTemporaryVariableId++
        return variableName
    }

    private fun Expression.lower(): LoweringResult = accept(visitor = this@ExpressionLoweringVisitor, context = Unit)

    private fun Expression.getLoweredAndAddStatements(statements: MutableList<HighIrStatement>): HighIrExpression {
        val result = this.lower()
        statements.addAll(elements = result.statements)
        return result.expression
    }

    override fun visit(expression: Expression.Literal, context: Unit): LoweringResult =
        Literal(literal = expression.literal).asLoweringResult()

    override fun visit(expression: Expression.This, context: Unit): LoweringResult =
        Variable(name = "this").asLoweringResult()

    override fun visit(expression: Expression.Variable, context: Unit): LoweringResult =
        Variable(name = expression.name).asLoweringResult()

    override fun visit(expression: Expression.ClassMember, context: Unit): LoweringResult =
        ClassMember(className = expression.className, memberName = expression.memberName).asLoweringResult()

    override fun visit(expression: Expression.TupleConstructor, context: Unit): LoweringResult {
        val loweredStatements = mutableListOf<HighIrStatement>()
        val loweredExpressionList = expression.expressionList.map {
            it.getLoweredAndAddStatements(statements = loweredStatements)
        }
        return StructConstructor(expressionList = loweredExpressionList)
            .asLoweringResult(statements = loweredStatements)
    }

    override fun visit(expression: Expression.ObjectConstructor, context: Unit): LoweringResult {
        val loweredStatements = mutableListOf<HighIrStatement>()
        val loweredFields = expression.fieldDeclarations.map { fieldConstructor ->
            when (fieldConstructor) {
                is Expression.ObjectConstructor.FieldConstructor.Field -> {
                    val result = fieldConstructor.expression.lower()
                    loweredStatements.addAll(elements = result.statements)
                    val loweredFieldExpression = result.expression
                    loweredFieldExpression
                }
                is Expression.ObjectConstructor.FieldConstructor.FieldShorthand -> {
                    val result = Expression.Variable(
                        range = fieldConstructor.range,
                        type = fieldConstructor.type,
                        name = fieldConstructor.name
                    ).lower()
                    loweredStatements.addAll(elements = result.statements)
                    val loweredFieldExpression = result.expression
                    loweredFieldExpression
                }
            }
        }
        return StructConstructor(expressionList = loweredFields)
            .asLoweringResult(statements = loweredStatements)
    }

    override fun visit(expression: Expression.VariantConstructor, context: Unit): LoweringResult {
        val result = expression.data.lower()
        return StructConstructor(
            expressionList = listOf(
                HighIrExpression.literal(value = expression.tagOrder.toLong()),
                result.expression
            )
        ).asLoweringResult(statements = result.statements)
    }

    override fun visit(expression: Expression.FieldAccess, context: Unit): LoweringResult {
        val result = expression.expression.lower()
        return IndexAccess(
            expression = result.expression,
            index = expression.fieldOrder
        ).asLoweringResult(statements = result.statements)
    }

    override fun visit(expression: Expression.MethodAccess, context: Unit): LoweringResult {
        val result = expression.expression.lower()
        return MethodAccess(
            expression = result.expression,
            className = (expression.expression.type as Type.IdentifierType).identifier,
            methodName = expression.methodName
        ).asLoweringResult(statements = result.statements)
    }

    override fun visit(expression: Expression.Unary, context: Unit): LoweringResult {
        val result = expression.expression.lower()
        return Unary(operator = expression.operator, expression = result.expression)
            .asLoweringResult(statements = result.statements)
    }

    override fun visit(expression: Expression.Panic, context: Unit): LoweringResult {
        val loweredStatements = mutableListOf<HighIrStatement>()
        val result = expression.expression.lower()
        loweredStatements += result.statements
        loweredStatements += Throw(expression = result.expression)
        return LoweringResult(statements = loweredStatements, expression = HighIrExpression.FALSE)
    }

    override fun visit(expression: Expression.BuiltInFunctionCall, context: Unit): LoweringResult {
        val loweredStatements = mutableListOf<HighIrStatement>()
        val (statements, argument) = expression.argumentExpression.lower()
        loweredStatements += statements
        val functionApplication = BuiltInFunctionApplication(
            functionName = expression.functionName,
            argument = argument
        )
        if (expression.type != Type.unit) {
            // Since we control these builtin functions,
            // we know that only functions with unit return type has side effects.
            return functionApplication.asLoweringResult(statements = loweredStatements)
        }
        loweredStatements += ExpressionAsStatement(
            expressionWithPotentialSideEffect = functionApplication
        )
        return loweredStatements.asLoweringResult()
    }

    override fun visit(expression: Expression.FunctionApplication, context: Unit): LoweringResult {
        val loweredStatements = mutableListOf<HighIrStatement>()
        val loweredFunctionExpression = expression.functionExpression
            .getLoweredAndAddStatements(statements = loweredStatements)
        val loweredArguments = expression.arguments.map { argument ->
            argument.getLoweredAndAddStatements(statements = loweredStatements)
        }
        // This indirection is necessary.
        // We want to force a function call to fall into a statement.
        // In this way, the final expression can be safely ignored and side effect of function still preserved.
        val temporary = allocateTemporaryVariable()
        loweredStatements += when (loweredFunctionExpression) {
            is ClassMember -> FunctionApplication(
                functionName = IrNameEncoder.encodeFunctionName(
                    moduleReference = moduleReference,
                    className = loweredFunctionExpression.className,
                    functionName = loweredFunctionExpression.memberName
                ),
                arguments = loweredArguments,
                resultCollector = temporary
            )
            is MethodAccess -> FunctionApplication(
                functionName = IrNameEncoder.encodeFunctionName(
                    moduleReference = moduleReference,
                    className = loweredFunctionExpression.className,
                    functionName = loweredFunctionExpression.methodName
                ),
                arguments = listOf(loweredFunctionExpression.expression, *loweredArguments.toTypedArray()),
                resultCollector = temporary
            )
            else -> ClosureApplication(
                functionExpression = loweredFunctionExpression,
                arguments = loweredArguments,
                resultCollector = temporary
            )
        }
        return LoweringResult(statements = loweredStatements, expression = Variable(name = temporary))
    }

    private fun shortCircuitBehaviorPreservingBoolExpressionLowering(expression: Expression): LoweringResult {
        if (expression is Expression.Literal) {
            val literal = expression.literal
            if (literal is samlang.ast.common.Literal.BoolLiteral) {
                return if (literal.value) HighIrExpression.TRUE.asLoweringResult() else HighIrExpression.FALSE.asLoweringResult()
            }
        }
        if (expression !is Expression.Binary) {
            return expression.lower()
        }
        val operator = expression.operator
        val e1 = expression.e1
        val e2 = expression.e2
        return when (operator) {
            BinaryOperator.AND -> {
                val temp = allocateTemporaryVariable()
                val e1Result = shortCircuitBehaviorPreservingBoolExpressionLowering(expression = e1)
                val e2Result = shortCircuitBehaviorPreservingBoolExpressionLowering(expression = e2)
                LoweringResult(
                    statements = listOf(
                        *e1Result.statements.toTypedArray(),
                        IfElse(
                            booleanExpression = e1Result.expression,
                            s1 = listOf(
                                *e2Result.statements.toTypedArray(),
                                LetDefinition(name = temp, assignedExpression = e2Result.expression)
                            ),
                            s2 = listOf(LetDefinition(name = temp, assignedExpression = HighIrExpression.FALSE))
                        )
                    ),
                    expression = Variable(name = temp)
                )
            }
            BinaryOperator.OR -> {
                val temp = allocateTemporaryVariable()
                val e1Result = shortCircuitBehaviorPreservingBoolExpressionLowering(expression = e1)
                val e2Result = shortCircuitBehaviorPreservingBoolExpressionLowering(expression = e2)
                LoweringResult(
                    statements = listOf(
                        *e1Result.statements.toTypedArray(),
                        IfElse(
                            booleanExpression = e1Result.expression,
                            s1 = listOf(LetDefinition(name = temp, assignedExpression = HighIrExpression.TRUE)),
                            s2 = listOf(
                                *e2Result.statements.toTypedArray(),
                                LetDefinition(name = temp, assignedExpression = e2Result.expression)
                            )
                        )
                    ),
                    expression = Variable(name = temp)
                )
            }
            else -> {
                val loweredStatements = mutableListOf<HighIrStatement>()
                val loweredE1 = expression.e1.getLoweredAndAddStatements(statements = loweredStatements)
                val loweredE2 = expression.e2.getLoweredAndAddStatements(statements = loweredStatements)
                Binary(operator = expression.operator, e1 = loweredE1, e2 = loweredE2)
                    .asLoweringResult(statements = loweredStatements)
            }
        }
    }

    override fun visit(expression: Expression.Binary, context: Unit): LoweringResult =
        shortCircuitBehaviorPreservingBoolExpressionLowering(expression)

    override fun visit(expression: Expression.IfElse, context: Unit): LoweringResult {
        val loweredStatements = mutableListOf<HighIrStatement>()
        val boolExpression = expression.boolExpression
            .getLoweredAndAddStatements(statements = loweredStatements)
        val e1LoweringResult = expression.e1.lower()
        val e2LoweringResult = expression.e2.lower()
        val variableForIfElseAssign = allocateTemporaryVariable()
        val loweredS1 = e1LoweringResult.statements.plus(
            element = LetDefinition(
                name = variableForIfElseAssign,
                assignedExpression = e1LoweringResult.expression
            )
        )
        val loweredS2 = e2LoweringResult.statements.plus(
            element = LetDefinition(
                name = variableForIfElseAssign,
                assignedExpression = e2LoweringResult.expression
            )
        )
        loweredStatements += IfElse(booleanExpression = boolExpression, s1 = loweredS1, s2 = loweredS2)
        return LoweringResult(
            statements = loweredStatements,
            expression = Variable(name = variableForIfElseAssign)
        )
    }

    override fun visit(expression: Expression.Match, context: Unit): LoweringResult {
        val loweredStatements = mutableListOf<HighIrStatement>()
        val matchedExpression = expression.matchedExpression
            .getLoweredAndAddStatements(statements = loweredStatements)
        val variableForMatchedExpression = allocateTemporaryVariable()
        loweredStatements += LetDefinition(
            name = variableForMatchedExpression,
            assignedExpression = matchedExpression
        )
        val loweredMatchingList = expression.matchingList.map { patternToExpression ->
            val result = patternToExpression.expression.lower()
            Match.VariantPatternToStatement(
                tagOrder = patternToExpression.tagOrder,
                dataVariable = patternToExpression.dataVariable,
                statements = result.statements,
                finalExpression = result.expression
            )
        }
        val temporaryVariable = allocateTemporaryVariable()
        loweredStatements += Match(
            assignedTemporaryVariable = temporaryVariable,
            variableForMatchedExpression = variableForMatchedExpression,
            matchingList = loweredMatchingList
        )
        return Variable(name = temporaryVariable).asLoweringResult(statements = loweredStatements)
    }

    override fun visit(expression: Expression.Lambda, context: Unit): LoweringResult {
        val loweringResult = expression.body.lower()
        return Lambda(
            hasReturn = expression.type.returnType != Type.unit,
            parameters = expression.parameters.map { it.first },
            captured = expression.captured.keys.toList(),
            body = loweringResult.statements.plus(element = Return(expression = loweringResult.expression))
        ).asLoweringResult()
    }

    override fun visit(expression: Expression.StatementBlockExpression, context: Unit): LoweringResult {
        val block = expression.block
        val loweredScopedStatements = mutableListOf<HighIrStatement>()
        for (statement in block.statements) {
            when (statement) {
                is Statement.Val -> {
                    val loweredAssignedExpression = statement.assignedExpression
                        .getLoweredAndAddStatements(statements = loweredScopedStatements)
                    when (val pattern = statement.pattern) {
                        is Pattern.TuplePattern -> {
                            val variableForDestructedExpression = allocateTemporaryVariable()
                            loweredScopedStatements += LetDefinition(
                                name = variableForDestructedExpression,
                                assignedExpression = loweredAssignedExpression
                            )
                            pattern.destructedNames.forEachIndexed { index, (name) ->
                                if (name != null) {
                                    loweredScopedStatements += LetDefinition(
                                        name = name,
                                        assignedExpression = IndexAccess(
                                            expression = Variable(name = variableForDestructedExpression),
                                            index = index
                                        )
                                    )
                                }
                            }
                        }
                        is Pattern.ObjectPattern -> {
                            val variableForDestructedExpression = allocateTemporaryVariable()
                            loweredScopedStatements += LetDefinition(
                                name = variableForDestructedExpression,
                                assignedExpression = loweredAssignedExpression
                            )
                            pattern.destructedNames.forEach { (name, order, renamed, _) ->
                                loweredScopedStatements += LetDefinition(
                                    name = renamed ?: name,
                                    assignedExpression = IndexAccess(
                                        expression = Variable(name = variableForDestructedExpression),
                                        index = order
                                    )
                                )
                            }
                        }
                        is Pattern.VariablePattern -> {
                            loweredScopedStatements += LetDefinition(
                                name = pattern.name,
                                assignedExpression = loweredAssignedExpression
                            )
                        }
                        is Pattern.WildCardPattern -> {
                            loweredScopedStatements += ExpressionAsStatement(
                                expressionWithPotentialSideEffect = loweredAssignedExpression
                            )
                        }
                    }
                }
            }
        }
        val finalExpression = block.expression
            ?: return loweredScopedStatements.asLoweringResult()
        val loweredFinalExpression = finalExpression.getLoweredAndAddStatements(statements = loweredScopedStatements)
        return LoweringResult(statements = loweredScopedStatements, expression = loweredFinalExpression)
    }
}
