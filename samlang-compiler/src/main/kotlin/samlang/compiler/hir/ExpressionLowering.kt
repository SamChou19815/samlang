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
import samlang.ast.hir.HighIrExpression.This
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
        Literal(type = expression.type, literal = expression.literal).asLoweringResult()

    override fun visit(expression: Expression.This, context: Unit): LoweringResult =
        This(type = expression.type).asLoweringResult()

    override fun visit(expression: Expression.Variable, context: Unit): LoweringResult =
        Variable(type = expression.type, name = expression.name).asLoweringResult()

    override fun visit(expression: Expression.ClassMember, context: Unit): LoweringResult =
        ClassMember(
            type = expression.type,
            typeArguments = expression.typeArguments,
            className = expression.className,
            memberName = expression.memberName
        ).asLoweringResult()

    override fun visit(expression: Expression.TupleConstructor, context: Unit): LoweringResult {
        val loweredStatements = arrayListOf<HighIrStatement>()
        val loweredExpressionList = expression.expressionList.map {
            it.getLoweredAndAddStatements(statements = loweredStatements) ?: UnitExpression
        }
        return TupleConstructor(
            type = expression.type,
            expressionList = loweredExpressionList
        ).asLoweringResult(statements = loweredStatements)
    }

    override fun visit(expression: Expression.ObjectConstructor, context: Unit): LoweringResult {
        val loweredStatements = arrayListOf<HighIrStatement>()
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
        return ObjectConstructor(type = expression.type as Type.IdentifierType, fieldDeclaration = loweredFields)
            .asLoweringResult(statements = loweredStatements)
    }

    override fun visit(expression: Expression.VariantConstructor, context: Unit): LoweringResult {
        val result = expression.data.lower()
        return VariantConstructor(
            type = expression.type as Type.IdentifierType,
            tag = expression.tag,
            data = result.expression ?: UnitExpression
        ).asLoweringResult(statements = result.statements)
    }

    override fun visit(expression: Expression.FieldAccess, context: Unit): LoweringResult {
        val result = expression.expression.lower()
        return FieldAccess(
            type = expression.type,
            expression = result.expression ?: error(message = "Object expression must be lowered!"),
            fieldName = expression.fieldName
        ).asLoweringResult(statements = result.statements)
    }

    override fun visit(expression: Expression.MethodAccess, context: Unit): LoweringResult {
        val result = expression.expression.lower()
        return MethodAccess(
            type = expression.type,
            expression = result.expression ?: error(message = "Object expression must be lowered!"),
            methodName = expression.methodName
        ).asLoweringResult(statements = result.statements)
    }

    override fun visit(expression: Expression.Unary, context: Unit): LoweringResult {
        val result = expression.expression.lower()
        return Unary(
            type = expression.type,
            operator = expression.operator,
            expression = result.expression ?: error(message = "Child of unary expression must be lowered!")
        ).asLoweringResult(statements = result.statements)
    }

    override fun visit(expression: Expression.Panic, context: Unit): LoweringResult {
        val loweredStatements = arrayListOf<HighIrStatement>()
        val result = expression.expression.lower()
        loweredStatements += result.statements
        loweredStatements += Throw(
            expression = result.expression ?: error(message = "String in panic must be lowered!")
        )
        return LoweringResult(statements = loweredStatements, expression = null)
    }

    override fun visit(expression: Expression.BuiltInFunctionCall, context: Unit): LoweringResult {
        val loweredStatements = arrayListOf<HighIrStatement>()
        val (statements, argument) = expression.argumentExpression.lower()
        loweredStatements += statements
        if (argument == null) {
            error(message = "Builtin function argument must be lowered!")
        }
        val functionApplication = BuiltInFunctionApplication(
            type = expression.type,
            functionName = expression.functionName,
            argument = argument
        )
        if (expression.type != Type.unit) {
            return functionApplication.asLoweringResult(statements = loweredStatements)
        }
        loweredStatements += ConstantDefinition(
            pattern = HighIrPattern.WildCardPattern,
            typeAnnotation = Type.unit,
            assignedExpression = functionApplication
        )
        return loweredStatements.asLoweringResult()
    }

    override fun visit(expression: Expression.FunctionApplication, context: Unit): LoweringResult {
        val loweredStatements = arrayListOf<HighIrStatement>()
        val loweredFunctionExpression = expression.functionExpression
            .getLoweredAndAddStatements(statements = loweredStatements)
            ?: error(message = "Function expression must be lowered!")
        val loweredArguments = expression.arguments.map { argument ->
            argument.getLoweredAndAddStatements(statements = loweredStatements) ?: UnitExpression
        }
        val type = expression.type
        val functionApplication = when (loweredFunctionExpression) {
            is ClassMember -> FunctionApplication(
                type = type,
                functionParent = loweredFunctionExpression.className,
                functionName = loweredFunctionExpression.memberName,
                typeArguments = loweredFunctionExpression.typeArguments,
                arguments = loweredArguments
            )
            is MethodAccess -> MethodApplication(
                type = type,
                objectExpression = loweredFunctionExpression.expression,
                methodName = loweredFunctionExpression.methodName,
                arguments = loweredArguments
            )
            else -> ClosureApplication(
                type = type,
                functionExpression = loweredFunctionExpression,
                arguments = loweredArguments
            )
        }
        if (type != Type.unit) {
            return functionApplication.asLoweringResult(statements = loweredStatements)
        }
        loweredStatements += ConstantDefinition(
            pattern = HighIrPattern.WildCardPattern,
            typeAnnotation = Type.unit,
            assignedExpression = functionApplication
        )
        return loweredStatements.asLoweringResult()
    }

    override fun visit(expression: Expression.Binary, context: Unit): LoweringResult {
        val loweredStatements = arrayListOf<HighIrStatement>()
        val e1 = expression.e1.getLoweredAndAddStatements(statements = loweredStatements) ?: UnitExpression
        val e2 = expression.e2.getLoweredAndAddStatements(statements = loweredStatements) ?: UnitExpression
        return Binary(
            type = expression.type,
            operator = expression.operator,
            e1 = e1,
            e2 = e2
        ).asLoweringResult(statements = loweredStatements)
    }

    override fun visit(expression: Expression.IfElse, context: Unit): LoweringResult {
        val loweredStatements = arrayListOf<HighIrStatement>()
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
                    type = expression.type,
                    boolExpression = boolExpression,
                    e1 = e1LoweredExpression,
                    e2 = e2LoweredExpression
                ).asLoweringResult(statements = loweredStatements)
            }
        }
        val variableForIfElseAssign = allocateTemporaryVariable()
        loweredStatements += LetDeclaration(name = variableForIfElseAssign, typeAnnotation = expression.type)
        val loweredS1 = if (e1LoweredExpression == null) {
            e1LoweringStatements
        } else {
            e1LoweringStatements.plus(
                element = VariableAssignment(name = variableForIfElseAssign, assignedExpression = e1LoweredExpression)
            )
        }
        val loweredS2 = if (e2LoweredExpression == null) {
            e1LoweringStatements
        } else {
            e2LoweringStatements.plus(
                element = VariableAssignment(name = variableForIfElseAssign, assignedExpression = e2LoweredExpression)
            )
        }
        loweredStatements += IfElse(booleanExpression = boolExpression, s1 = loweredS1, s2 = loweredS2)
        return LoweringResult(
            statements = loweredStatements,
            expression = Variable(type = expression.type, name = variableForIfElseAssign)
        )
    }

    override fun visit(expression: Expression.Match, context: Unit): LoweringResult {
        val loweredStatements = arrayListOf<HighIrStatement>()
        val matchedExpression = expression.matchedExpression
            .getLoweredAndAddStatements(statements = loweredStatements)
            ?: error(message = "Matched expression in match expression should be lowered!")
        val variableForMatchedExpression = allocateTemporaryVariable()
        loweredStatements += ConstantDefinition(
            pattern = HighIrPattern.VariablePattern(name = variableForMatchedExpression),
            typeAnnotation = expression.matchedExpression.type,
            assignedExpression = matchedExpression
        )
        val loweredMatchingList = expression.matchingList.map { patternToExpression ->
            val result = patternToExpression.expression.lower()
            Match.VariantPatternToStatement(
                tag = patternToExpression.tag,
                dataVariable = patternToExpression.dataVariable,
                statements = result.statements,
                finalExpression = result.expression
            )
        }
        val matchedExpressionType = matchedExpression.type as Type.IdentifierType
        return when {
            loweredMatchingList.all { it.finalExpression == null } -> {
                loweredStatements += Match(
                    type = expression.type,
                    assignedTemporaryVariable = null,
                    variableForMatchedExpression = variableForMatchedExpression,
                    variableForMatchedExpressionType = matchedExpressionType,
                    matchingList = loweredMatchingList
                )
                loweredStatements.asLoweringResult()
            }
            loweredMatchingList.all { it.finalExpression != null } -> {
                val temporaryVariable = allocateTemporaryVariable()
                loweredStatements += Match(
                    type = expression.type,
                    assignedTemporaryVariable = temporaryVariable,
                    variableForMatchedExpression = variableForMatchedExpression,
                    variableForMatchedExpressionType = matchedExpressionType,
                    matchingList = loweredMatchingList
                )
                Variable(type = expression.type, name = temporaryVariable)
                    .asLoweringResult(statements = loweredStatements)
            }
            else -> error(message = "Either all final lowered expression should be null or not null.")
        }
    }

    override fun visit(expression: Expression.Lambda, context: Unit): LoweringResult {
        val loweringResult = expression.body.lower()
        val loweredStatements = loweringResult.unwrappedStatements
        val loweredExpression = loweringResult.expression
        return if (loweredExpression == null) {
            Lambda(
                type = expression.type,
                parameters = expression.parameters,
                captured = expression.captured,
                body = loweredStatements
            ).asLoweringResult()
        } else {
            Lambda(
                type = expression.type,
                parameters = expression.parameters,
                captured = expression.captured,
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
        val loweredScopedStatements = arrayListOf<HighIrStatement>()
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
                            destructedNames = pattern.destructedNames.map { (name, renamed, _) -> name to renamed }
                        )
                        is Pattern.VariablePattern -> HighIrPattern.VariablePattern(name = pattern.name)
                        is Pattern.WildCardPattern -> HighIrPattern.WildCardPattern
                    }
                    loweredScopedStatements += ConstantDefinition(
                        pattern = loweredPattern,
                        typeAnnotation = statement.typeAnnotation,
                        assignedExpression = loweredAssignedExpression
                    )
                }
            }
        }
        val finalExpression = block.expression
            ?: return listOf(Block(statements = loweredScopedStatements)).asLoweringResult()
        val loweredFinalExpression = finalExpression.getLoweredAndAddStatements(statements = loweredScopedStatements)
            ?: return listOf(Block(statements = loweredScopedStatements)).asLoweringResult()
        if (loweredFinalExpression.type == Type.unit && loweredFinalExpression is FunctionApplication) {
            loweredScopedStatements += ConstantDefinition(
                pattern = HighIrPattern.WildCardPattern,
                typeAnnotation = Type.unit,
                assignedExpression = loweredFinalExpression
            )
            return listOf(Block(statements = loweredScopedStatements)).asLoweringResult()
        }
        val scopedFinalVariable = allocateTemporaryVariable()
        val scopedFinalVariableType = loweredFinalExpression.type
        loweredScopedStatements += VariableAssignment(
            name = scopedFinalVariable,
            assignedExpression = loweredFinalExpression
        )
        return LoweringResult(
            statements = listOf(
                LetDeclaration(name = scopedFinalVariable, typeAnnotation = scopedFinalVariableType),
                Block(statements = loweredScopedStatements)
            ),
            expression = Variable(type = scopedFinalVariableType, name = scopedFinalVariable)
        )
    }
}
