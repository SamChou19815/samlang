package samlang.compiler.hir

import samlang.ast.common.Type
import samlang.ast.hir.HighIrExpression
import samlang.ast.hir.HighIrExpression.Binary
import samlang.ast.hir.HighIrExpression.BuiltInFunctionApplication
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
import samlang.ast.hir.HighIrExpression.TupleConstructor
import samlang.ast.hir.HighIrExpression.Unary
import samlang.ast.hir.HighIrExpression.UnitExpression
import samlang.ast.hir.HighIrExpression.Variable
import samlang.ast.hir.HighIrExpression.VariantConstructor
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
import samlang.ast.lang.Expression
import samlang.ast.lang.ExpressionVisitor
import samlang.ast.lang.Pattern
import samlang.ast.lang.Statement

internal fun lowerExpression(expression: Expression): LoweringResult =
    expression.accept(visitor = ExpressionLoweringVisitor(), context = Unit)

internal data class LoweringResult(val statements: List<HighIrStatement>, val expression: HighIrExpression?) {
    val unwrappedStatements: List<HighIrStatement>
        get() {
            if (statements.size != 1) {
                return statements
            }
            val statement = statements[0] as? Block ?: return statements
            return statement.statements
        }
}

private fun HighIrExpression.asLoweringResult(statements: List<HighIrStatement> = emptyList()): LoweringResult =
    LoweringResult(statements = statements, expression = this)

private fun List<HighIrStatement>.asLoweringResult(): LoweringResult =
    LoweringResult(statements = this, expression = null)

private class ExpressionLoweringVisitor : ExpressionVisitor<Unit, LoweringResult> {

    private var nextTemporaryVariableId: Int = 0

    private fun allocateTemporaryVariable(): String {
        val variableName = "_LOWERING_$nextTemporaryVariableId"
        nextTemporaryVariableId++
        return variableName
    }

    private fun Expression.lower(): LoweringResult = accept(visitor = this@ExpressionLoweringVisitor, context = Unit)

    private fun Expression.getLoweredAndAddStatements(statements: MutableList<HighIrStatement>): HighIrExpression? {
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
            it.getLoweredAndAddStatements(statements = loweredStatements) ?: UnitExpression
        }
        return TupleConstructor(expressionList = loweredExpressionList).asLoweringResult(statements = loweredStatements)
    }

    override fun visit(expression: Expression.ObjectConstructor, context: Unit): LoweringResult {
        val loweredStatements = mutableListOf<HighIrStatement>()
        val loweredFields = expression.fieldDeclarations.map { fieldConstructor ->
            when (fieldConstructor) {
                is Expression.ObjectConstructor.FieldConstructor.Field -> {
                    val result = fieldConstructor.expression.lower()
                    loweredStatements.addAll(elements = result.statements)
                    val loweredFieldExpression = result.expression ?: UnitExpression
                    fieldConstructor.name to loweredFieldExpression
                }
                is Expression.ObjectConstructor.FieldConstructor.FieldShorthand -> {
                    val result = Expression.Variable(
                        range = fieldConstructor.range,
                        type = fieldConstructor.type,
                        name = fieldConstructor.name
                    ).lower()
                    loweredStatements.addAll(elements = result.statements)
                    val loweredFieldExpression = result.expression ?: UnitExpression
                    fieldConstructor.name to loweredFieldExpression
                }
            }
        }
        return ObjectConstructor(fieldDeclaration = loweredFields)
            .asLoweringResult(statements = loweredStatements)
    }

    override fun visit(expression: Expression.VariantConstructor, context: Unit): LoweringResult {
        val result = expression.data.lower()
        return VariantConstructor(
            tag = expression.tag,
            tagOrder = expression.tagOrder,
            data = result.expression ?: UnitExpression
        ).asLoweringResult(statements = result.statements)
    }

    override fun visit(expression: Expression.FieldAccess, context: Unit): LoweringResult {
        val result = expression.expression.lower()
        return FieldAccess(
            expression = result.expression ?: error(message = "Object expression must be lowered!"),
            fieldName = expression.fieldName,
            fieldOrder = expression.fieldOrder
        ).asLoweringResult(statements = result.statements)
    }

    override fun visit(expression: Expression.MethodAccess, context: Unit): LoweringResult {
        val result = expression.expression.lower()
        return MethodAccess(
            expression = result.expression ?: error(message = "Object expression must be lowered!"),
            className = (expression.expression.type as Type.IdentifierType).identifier,
            methodName = expression.methodName
        ).asLoweringResult(statements = result.statements)
    }

    override fun visit(expression: Expression.Unary, context: Unit): LoweringResult {
        val result = expression.expression.lower()
        return Unary(
            operator = expression.operator,
            expression = result.expression ?: error(message = "Child of unary expression must be lowered!")
        ).asLoweringResult(statements = result.statements)
    }

    override fun visit(expression: Expression.Panic, context: Unit): LoweringResult {
        val loweredStatements = mutableListOf<HighIrStatement>()
        val result = expression.expression.lower()
        loweredStatements += result.statements
        loweredStatements += Throw(
            expression = result.expression ?: error(message = "String in panic must be lowered!")
        )
        return LoweringResult(statements = loweredStatements, expression = null)
    }

    override fun visit(expression: Expression.BuiltInFunctionCall, context: Unit): LoweringResult {
        val loweredStatements = mutableListOf<HighIrStatement>()
        val (statements, argument) = expression.argumentExpression.lower()
        loweredStatements += statements
        if (argument == null) {
            error(message = "Builtin function argument must be lowered!")
        }
        val functionApplication = BuiltInFunctionApplication(
            functionName = expression.functionName,
            argument = argument
        )
        if (expression.type != Type.unit) {
            return functionApplication.asLoweringResult(statements = loweredStatements)
        }
        loweredStatements += ConstantDefinition(
            pattern = HighIrPattern.WildCardPattern,
            assignedExpression = functionApplication
        )
        return loweredStatements.asLoweringResult()
    }

    override fun visit(expression: Expression.FunctionApplication, context: Unit): LoweringResult {
        val loweredStatements = mutableListOf<HighIrStatement>()
        val loweredFunctionExpression = expression.functionExpression
            .getLoweredAndAddStatements(statements = loweredStatements)
            ?: error(message = "Function expression must be lowered!")
        val loweredArguments = expression.arguments.map { argument ->
            argument.getLoweredAndAddStatements(statements = loweredStatements) ?: UnitExpression
        }
        val type = expression.type
        val functionApplication = when (loweredFunctionExpression) {
            is ClassMember -> FunctionApplication(
                className = loweredFunctionExpression.className,
                functionName = loweredFunctionExpression.memberName,
                arguments = loweredArguments
            )
            is MethodAccess -> MethodApplication(
                objectExpression = loweredFunctionExpression.expression,
                className = loweredFunctionExpression.className,
                methodName = loweredFunctionExpression.methodName,
                arguments = loweredArguments
            )
            else -> ClosureApplication(
                functionExpression = loweredFunctionExpression,
                arguments = loweredArguments
            )
        }
        if (type != Type.unit) {
            return functionApplication.asLoweringResult(statements = loweredStatements)
        }
        loweredStatements += ConstantDefinition(
            pattern = HighIrPattern.WildCardPattern,
            assignedExpression = functionApplication
        )
        return loweredStatements.asLoweringResult()
    }

    override fun visit(expression: Expression.Binary, context: Unit): LoweringResult {
        val loweredStatements = mutableListOf<HighIrStatement>()
        val e1 = expression.e1.getLoweredAndAddStatements(statements = loweredStatements) ?: UnitExpression
        val e2 = expression.e2.getLoweredAndAddStatements(statements = loweredStatements) ?: UnitExpression
        return Binary(
            operator = expression.operator,
            e1 = e1,
            e2 = e2
        ).asLoweringResult(statements = loweredStatements)
    }

    override fun visit(expression: Expression.IfElse, context: Unit): LoweringResult {
        val loweredStatements = mutableListOf<HighIrStatement>()
        val boolExpression = expression.boolExpression
            .getLoweredAndAddStatements(statements = loweredStatements)
            ?: error(message = "Bool expression in if-else guard should be lowered!")
        val e1LoweringResult = expression.e1.lower()
        val e2LoweringResult = expression.e2.lower()
        val e1LoweredExpression = e1LoweringResult.expression
        val e1LoweringStatements = e1LoweringResult.unwrappedStatements
        val e2LoweredExpression = e2LoweringResult.expression
        val e2LoweringStatements = e2LoweringResult.unwrappedStatements
        if (e1LoweredExpression == null && e2LoweredExpression == null) {
            loweredStatements += IfElse(
                booleanExpression = boolExpression,
                s1 = e1LoweringStatements,
                s2 = e2LoweringStatements
            )
            return loweredStatements.asLoweringResult()
        }
        if (e1LoweredExpression != null && e2LoweredExpression != null) {
            if (e1LoweringStatements.isEmpty() && e2LoweringStatements.isEmpty()) {
                return Ternary(
                    boolExpression = boolExpression,
                    e1 = e1LoweredExpression,
                    e2 = e2LoweredExpression
                ).asLoweringResult(statements = loweredStatements)
            }
        }
        val variableForIfElseAssign = allocateTemporaryVariable()
        loweredStatements += LetDeclaration(name = variableForIfElseAssign)
        val loweredS1 = if (e1LoweredExpression == null) {
            e1LoweringStatements
        } else {
            e1LoweringStatements.plus(
                element = VariableAssignment(name = variableForIfElseAssign, assignedExpression = e1LoweredExpression)
            )
        }
        val loweredS2 = if (e2LoweredExpression == null) {
            e2LoweringStatements
        } else {
            e2LoweringStatements.plus(
                element = VariableAssignment(name = variableForIfElseAssign, assignedExpression = e2LoweredExpression)
            )
        }
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
            ?: error(message = "Matched expression in match expression should be lowered!")
        val variableForMatchedExpression = allocateTemporaryVariable()
        loweredStatements += ConstantDefinition(
            pattern = HighIrPattern.VariablePattern(name = variableForMatchedExpression),
            assignedExpression = matchedExpression
        )
        val loweredMatchingList = expression.matchingList.map { patternToExpression ->
            val result = patternToExpression.expression.lower()
            Match.VariantPatternToStatement(
                tag = patternToExpression.tag,
                tagOrder = patternToExpression.tagOrder,
                dataVariable = patternToExpression.dataVariable,
                statements = result.statements,
                finalExpression = result.expression
            )
        }
        return if (loweredMatchingList.all { it.finalExpression == null }) {
            loweredStatements += Match(
                assignedTemporaryVariable = null,
                variableForMatchedExpression = variableForMatchedExpression,
                matchingList = loweredMatchingList
            )
            loweredStatements.asLoweringResult()
        } else {
            val temporaryVariable = allocateTemporaryVariable()
            loweredStatements += Match(
                assignedTemporaryVariable = temporaryVariable,
                variableForMatchedExpression = variableForMatchedExpression,
                matchingList = loweredMatchingList
            )
            Variable(name = temporaryVariable).asLoweringResult(statements = loweredStatements)
        }
    }

    override fun visit(expression: Expression.Lambda, context: Unit): LoweringResult {
        val loweringResult = expression.body.lower()
        val loweredStatements = loweringResult.unwrappedStatements
        val loweredExpression = loweringResult.expression
        return if (loweredExpression == null) {
            Lambda(
                hasReturn = expression.type.returnType != Type.unit,
                parameters = expression.parameters.map { it.first },
                captured = expression.captured.keys.toList(),
                body = loweredStatements
            ).asLoweringResult()
        } else {
            Lambda(
                hasReturn = expression.type.returnType != Type.unit,
                parameters = expression.parameters.map { it.first },
                captured = expression.captured.keys.toList(),
                body = loweredStatements.plus(element = Return(expression = loweredExpression))
            ).asLoweringResult()
        }
    }

    override fun visit(expression: Expression.StatementBlockExpression, context: Unit): LoweringResult {
        val block = expression.block
        if (block.statements.isEmpty()) {
            return block.expression
                ?.accept(visitor = this, context = Unit)
                ?: LoweringResult(statements = emptyList(), expression = null)
        }
        val loweredScopedStatements = mutableListOf<HighIrStatement>()
        for (statement in block.statements) {
            when (statement) {
                is Statement.Val -> {
                    val loweredAssignedExpression = statement.assignedExpression
                        .getLoweredAndAddStatements(statements = loweredScopedStatements)
                        ?: UnitExpression
                    val loweredPattern = when (val pattern = statement.pattern) {
                        is Pattern.TuplePattern -> HighIrPattern.TuplePattern(
                            destructedNames = pattern.destructedNames.map { it.first }
                        )
                        is Pattern.ObjectPattern -> HighIrPattern.ObjectPattern(
                            destructedNames = pattern.destructedNames.map { (name, order, renamed, _) ->
                                Triple(first = name, second = order, third = renamed)
                            }
                        )
                        is Pattern.VariablePattern -> HighIrPattern.VariablePattern(name = pattern.name)
                        is Pattern.WildCardPattern -> HighIrPattern.WildCardPattern
                    }
                    loweredScopedStatements += ConstantDefinition(
                        pattern = loweredPattern,
                        assignedExpression = loweredAssignedExpression
                    )
                }
            }
        }
        val finalExpression = block.expression
            ?: return listOf(Block(statements = loweredScopedStatements)).asLoweringResult()
        val loweredFinalExpression = finalExpression.getLoweredAndAddStatements(statements = loweredScopedStatements)
            ?: return listOf(Block(statements = loweredScopedStatements)).asLoweringResult()
        if (finalExpression.type == Type.unit && loweredFinalExpression is FunctionApplication) {
            loweredScopedStatements += ConstantDefinition(
                pattern = HighIrPattern.WildCardPattern,
                assignedExpression = loweredFinalExpression
            )
            return listOf(Block(statements = loweredScopedStatements)).asLoweringResult()
        }
        val scopedFinalVariable = allocateTemporaryVariable()
        loweredScopedStatements += VariableAssignment(
            name = scopedFinalVariable,
            assignedExpression = loweredFinalExpression
        )
        return LoweringResult(
            statements = listOf(
                LetDeclaration(name = scopedFinalVariable),
                Block(statements = loweredScopedStatements)
            ),
            expression = Variable(name = scopedFinalVariable)
        )
    }
}
