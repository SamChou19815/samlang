package samlang.compiler.ir

import samlang.ast.common.Type
import samlang.ast.hir.HighIrExpression
import samlang.ast.hir.HighIrExpression.Binary
import samlang.ast.hir.HighIrExpression.ClassMember
import samlang.ast.hir.HighIrExpression.Companion.UNIT
import samlang.ast.hir.HighIrExpression.FieldAccess
import samlang.ast.hir.HighIrExpression.FunctionApplication
import samlang.ast.hir.HighIrExpression.Lambda
import samlang.ast.hir.HighIrExpression.Literal
import samlang.ast.hir.HighIrExpression.MethodAccess
import samlang.ast.hir.HighIrExpression.Never
import samlang.ast.hir.HighIrExpression.ObjectConstructor
import samlang.ast.hir.HighIrExpression.Ternary
import samlang.ast.hir.HighIrExpression.This
import samlang.ast.hir.HighIrExpression.TupleConstructor
import samlang.ast.hir.HighIrExpression.Unary
import samlang.ast.hir.HighIrExpression.Variable
import samlang.ast.hir.HighIrExpression.VariantConstructor
import samlang.ast.hir.HighIrPattern
import samlang.ast.hir.HighIrStatement
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

internal data class LoweringResult(val statements: List<HighIrStatement>, val expression: HighIrExpression)

private fun HighIrExpression.asLoweringResult(statements: List<HighIrStatement> = emptyList()): LoweringResult =
    LoweringResult(statements = statements, expression = this)

private fun List<HighIrStatement>.asLoweringResult(): LoweringResult =
    LoweringResult(statements = this, expression = UNIT)

private class ExpressionLoweringVisitor : ExpressionVisitor<Unit, LoweringResult> {

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
            it.getLoweredAndAddStatements(statements = loweredStatements)
        }
        return TupleConstructor(
            type = expression.type,
            expressionList = loweredExpressionList
        ).asLoweringResult(statements = loweredStatements)
    }

    override fun visit(expression: Expression.ObjectConstructor, context: Unit): LoweringResult {
        val loweredStatements = arrayListOf<HighIrStatement>()
        val loweredSpreadExpression =
            expression.spreadExpression?.getLoweredAndAddStatements(statements = loweredStatements)
        val loweredFields = expression.fieldDeclarations.map { fieldConstructor ->
            when (fieldConstructor) {
                is Expression.ObjectConstructor.FieldConstructor.Field -> {
                    val result = fieldConstructor.expression.lower()
                    loweredStatements.addAll(elements = result.statements)
                    fieldConstructor.name to result.expression
                }
                is Expression.ObjectConstructor.FieldConstructor.FieldShorthand -> {
                    val result = Expression.Variable(
                        range = fieldConstructor.range,
                        type = fieldConstructor.type,
                        name = fieldConstructor.name
                    ).lower()
                    loweredStatements.addAll(elements = result.statements)
                    fieldConstructor.name to result.expression
                }
            }
        }
        return ObjectConstructor(
            type = expression.type as Type.IdentifierType,
            spreadExpression = loweredSpreadExpression,
            fieldDeclaration = loweredFields
        ).asLoweringResult(statements = loweredStatements)
    }

    override fun visit(expression: Expression.VariantConstructor, context: Unit): LoweringResult {
        val result = expression.data.lower()
        return VariantConstructor(
            type = expression.type as Type.IdentifierType,
            tag = expression.tag,
            data = result.expression
        ).asLoweringResult(statements = result.statements)
    }

    override fun visit(expression: Expression.FieldAccess, context: Unit): LoweringResult {
        val result = expression.expression.lower()
        return FieldAccess(
            type = expression.type,
            expression = result.expression,
            fieldName = expression.fieldName
        ).asLoweringResult(statements = result.statements)
    }

    override fun visit(expression: Expression.MethodAccess, context: Unit): LoweringResult {
        val result = expression.expression.lower()
        return MethodAccess(
            type = expression.type,
            expression = result.expression,
            methodName = expression.methodName
        ).asLoweringResult(statements = result.statements)
    }

    override fun visit(expression: Expression.Unary, context: Unit): LoweringResult {
        val result = expression.expression.lower()
        return Unary(
            type = expression.type,
            operator = expression.operator,
            expression = result.expression
        ).asLoweringResult(statements = result.statements)
    }

    override fun visit(expression: Expression.Panic, context: Unit): LoweringResult {
        val loweredStatements = arrayListOf<HighIrStatement>()
        val result = expression.expression.lower()
        loweredStatements.addAll(elements = result.statements)
        loweredStatements.add(element = Throw(expression = result.expression))
        return LoweringResult(statements = loweredStatements, expression = Never)
    }

    override fun visit(expression: Expression.FunctionApplication, context: Unit): LoweringResult {
        val loweredStatements = arrayListOf<HighIrStatement>()
        val loweredFunctionExpression =
            expression.functionExpression.getLoweredAndAddStatements(statements = loweredStatements)
        val loweredArguments =
            expression.arguments.map { it.getLoweredAndAddStatements(statements = loweredStatements) }
        return FunctionApplication(
            type = expression.type,
            functionExpression = loweredFunctionExpression,
            arguments = loweredArguments
        ).asLoweringResult(statements = loweredStatements)
    }

    override fun visit(expression: Expression.Binary, context: Unit): LoweringResult {
        val loweredStatements = arrayListOf<HighIrStatement>()
        val e1 = expression.e1.getLoweredAndAddStatements(statements = loweredStatements)
        val e2 = expression.e2.getLoweredAndAddStatements(statements = loweredStatements)
        return Binary(
            type = expression.type,
            operator = expression.operator,
            e1 = e1,
            e2 = e2
        ).asLoweringResult(statements = loweredStatements)
    }

    override fun visit(expression: Expression.IfElse, context: Unit): LoweringResult {
        val loweredStatements = arrayListOf<HighIrStatement>()
        val boolExpression = expression.boolExpression.getLoweredAndAddStatements(statements = loweredStatements)
        val e1LoweringResult = expression.e1.lower()
        val e2LoweringResult = expression.e2.lower()
        if (e1LoweringResult.statements.isEmpty() && e2LoweringResult.statements.isEmpty()) {
            return Ternary(
                type = expression.type,
                boolExpression = boolExpression,
                e1 = e1LoweringResult.expression,
                e2 = e2LoweringResult.expression
            ).asLoweringResult(statements = loweredStatements)
        }
        if ((e1LoweringResult.expression == UNIT || e1LoweringResult.expression == Never) &&
            (e2LoweringResult.expression == UNIT || e2LoweringResult.expression == Never)
        ) {
            loweredStatements.add(
                element = IfElse(
                    booleanExpression = boolExpression,
                    s1 = e1LoweringResult.statements,
                    s2 = e2LoweringResult.statements
                )
            )
            return loweredStatements.asLoweringResult()
        }
        val variableForIfElseAssign = allocateTemporaryVariable()
        loweredStatements.add(
            element = LetDeclaration(
                name = variableForIfElseAssign,
                typeAnnotation = expression.type
            )
        )
        val loweredS1 = if (e1LoweringResult.expression == Never) {
            e1LoweringResult.statements
        } else {
            e1LoweringResult.statements.plus(
                element = VariableAssignment(
                    name = variableForIfElseAssign,
                    assignedExpression = e1LoweringResult.expression
                )
            )
        }
        val loweredS2 = if (e2LoweringResult.expression == Never) {
            e2LoweringResult.statements
        } else {
            e2LoweringResult.statements.plus(
                element = VariableAssignment(
                    name = variableForIfElseAssign,
                    assignedExpression = e2LoweringResult.expression
                )
            )
        }
        loweredStatements.add(element = IfElse(booleanExpression = boolExpression, s1 = loweredS1, s2 = loweredS2))
        return LoweringResult(
            statements = loweredStatements,
            expression = Variable(type = expression.type, name = variableForIfElseAssign)
        )
    }

    override fun visit(expression: Expression.Match, context: Unit): LoweringResult {
        val loweredStatements = arrayListOf<HighIrStatement>()
        val matchedExpression = expression.matchedExpression.getLoweredAndAddStatements(statements = loweredStatements)
        val variableForMatchedExpression = allocateTemporaryVariable()
        loweredStatements.add(
            element = ConstantDefinition(
                pattern = HighIrPattern.VariablePattern(name = variableForMatchedExpression),
                typeAnnotation = expression.matchedExpression.type,
                assignedExpression = matchedExpression
            )
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
        if (expression.type == Type.unit) {
            loweredStatements.add(
                element = Match(
                    type = expression.type,
                    assignedTemporaryVariable = null,
                    variableForMatchedExpression = variableForMatchedExpression,
                    variableForMatchedExpressionType = matchedExpressionType,
                    matchingList = loweredMatchingList
                )
            )
            return loweredStatements.asLoweringResult()
        } else {
            val temporaryVariable = allocateTemporaryVariable()
            loweredStatements.add(
                element = Match(
                    type = expression.type,
                    assignedTemporaryVariable = temporaryVariable,
                    variableForMatchedExpression = variableForMatchedExpression,
                    variableForMatchedExpressionType = matchedExpressionType,
                    matchingList = loweredMatchingList
                )
            )
            return Variable(
                type = expression.type,
                name = temporaryVariable
            ).asLoweringResult(statements = loweredStatements)
        }
    }

    override fun visit(expression: Expression.Lambda, context: Unit): LoweringResult {
        val result = expression.body.lower()
        return if (result.expression == UNIT || result.expression == Never) {
            Lambda(
                type = expression.type,
                parameters = expression.parameters,
                body = result.statements
            ).asLoweringResult()
        } else {
            Lambda(
                type = expression.type,
                parameters = expression.parameters,
                body = result.statements.plus(element = Return(expression = result.expression))
            ).asLoweringResult()
        }
    }

    override fun visit(expression: Expression.StatementBlockExpression, context: Unit): LoweringResult {
        val block = expression.block
        val loweredStatements = arrayListOf<HighIrStatement>()
        for (statement in block.statements) {
            when (statement) {
                is Statement.Val -> {
                    val loweredAssignedExpression =
                        statement.assignedExpression.getLoweredAndAddStatements(statements = loweredStatements)
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
                    loweredStatements += ConstantDefinition(
                        pattern = loweredPattern,
                        typeAnnotation = statement.typeAnnotation,
                        assignedExpression = loweredAssignedExpression
                    )
                }
            }
        }
        val finalExpression = block.expression ?: return loweredStatements.asLoweringResult()
        return finalExpression
            .getLoweredAndAddStatements(statements = loweredStatements)
            .asLoweringResult(statements = loweredStatements)
    }
}
