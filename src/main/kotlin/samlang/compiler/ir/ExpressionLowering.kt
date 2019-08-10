package samlang.compiler.ir

import samlang.ast.common.Type
import samlang.ast.ir.IrExpression
import samlang.ast.ir.IrExpression.Binary
import samlang.ast.ir.IrExpression.ClassMember
import samlang.ast.ir.IrExpression.FieldAccess
import samlang.ast.ir.IrExpression.FunctionApplication
import samlang.ast.ir.IrExpression.Lambda
import samlang.ast.ir.IrExpression.Literal
import samlang.ast.ir.IrExpression.MethodAccess
import samlang.ast.ir.IrExpression.ObjectConstructor
import samlang.ast.ir.IrExpression.Ternary
import samlang.ast.ir.IrExpression.TupleConstructor
import samlang.ast.ir.IrExpression.Unary
import samlang.ast.ir.IrExpression.Variable
import samlang.ast.ir.IrExpression.VariantConstructor
import samlang.ast.ir.IrStatement
import samlang.ast.ir.IrStatement.ConstantDefinition
import samlang.ast.ir.IrStatement.IfElse
import samlang.ast.ir.IrStatement.LetDeclaration
import samlang.ast.ir.IrStatement.Match
import samlang.ast.ir.IrStatement.Return
import samlang.ast.ir.IrStatement.Throw
import samlang.ast.ir.IrStatement.VariableAssignment
import samlang.ast.lang.Expression
import samlang.ast.lang.ExpressionVisitor
import samlang.ast.lang.Pattern
import samlang.ast.ts.TsPattern

internal fun lowerExpression(expression: Expression): LoweringResult =
    expression.accept(visitor = ExpressionLoweringVisitor(), context = Unit)

internal val IR_UNIT: Literal = Literal(literal = samlang.ast.common.Literal.UnitLiteral)

internal data class LoweringResult(val statements: List<IrStatement>, val expression: IrExpression)

private fun IrExpression.asLoweringResult(statements: List<IrStatement> = emptyList()): LoweringResult =
    LoweringResult(statements = statements, expression = this)

private fun List<IrStatement>.asLoweringResult(): LoweringResult =
    LoweringResult(statements = this, expression = IR_UNIT)

private class ExpressionLoweringVisitor : ExpressionVisitor<Unit, LoweringResult> {

    private var nextTemporaryVariableId: Int = 0

    private fun allocateTemporaryVariable(): String {
        val variableName = "_LOWERING_$nextTemporaryVariableId"
        nextTemporaryVariableId++
        return variableName
    }

    private fun Expression.lower(): LoweringResult = accept(visitor = this@ExpressionLoweringVisitor, context = Unit)

    private fun Expression.getLoweredAndAddStatements(statements: MutableList<IrStatement>): IrExpression {
        val result = this.lower()
        statements.addAll(elements = statements)
        return result.expression
    }

    override fun visit(expression: Expression.Literal, context: Unit): LoweringResult =
        Literal(literal = expression.literal).asLoweringResult()

    override fun visit(expression: Expression.This, context: Unit): LoweringResult =
        Variable(name = "_this").asLoweringResult()

    override fun visit(expression: Expression.Variable, context: Unit): LoweringResult =
        Variable(name = expression.name).asLoweringResult()

    override fun visit(expression: Expression.ClassMember, context: Unit): LoweringResult =
        ClassMember(className = expression.className, memberName = expression.memberName).asLoweringResult()

    override fun visit(expression: Expression.TupleConstructor, context: Unit): LoweringResult {
        val loweredStatements = arrayListOf<IrStatement>()
        val loweredExpressionList = expression.expressionList.map {
            it.getLoweredAndAddStatements(statements = loweredStatements)
        }
        return TupleConstructor(expressionList = loweredExpressionList).asLoweringResult(statements = loweredStatements)
    }

    override fun visit(expression: Expression.ObjectConstructor, context: Unit): LoweringResult {
        val loweredStatements = arrayListOf<IrStatement>()
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
            spreadExpression = loweredSpreadExpression,
            fieldDeclaration = loweredFields
        ).asLoweringResult(statements = loweredStatements)
    }

    override fun visit(expression: Expression.VariantConstructor, context: Unit): LoweringResult {
        val result = expression.data.lower()
        return VariantConstructor(
            tag = expression.tag,
            data = result.expression
        ).asLoweringResult(statements = result.statements)
    }

    override fun visit(expression: Expression.FieldAccess, context: Unit): LoweringResult {
        val result = expression.expression.lower()
        return FieldAccess(
            expression = result.expression,
            fieldName = expression.fieldName
        ).asLoweringResult(statements = result.statements)
    }

    override fun visit(expression: Expression.MethodAccess, context: Unit): LoweringResult {
        val result = expression.expression.lower()
        return MethodAccess(expression = result.expression, methodName = expression.methodName).asLoweringResult(
            statements = result.statements
        )
    }

    override fun visit(expression: Expression.Unary, context: Unit): LoweringResult {
        val result = expression.expression.lower()
        return Unary(
            operator = expression.operator,
            expression = result.expression
        ).asLoweringResult(statements = result.statements)
    }

    override fun visit(expression: Expression.Panic, context: Unit): LoweringResult {
        val loweredStatements = arrayListOf<IrStatement>()
        val result = expression.expression.lower()
        loweredStatements.addAll(elements = result.statements)
        loweredStatements.add(element = Throw(expression = result.expression))
        return LoweringResult(
            statements = loweredStatements,
            expression = IR_UNIT
        )
    }

    override fun visit(expression: Expression.FunctionApplication, context: Unit): LoweringResult {
        val loweredStatements = arrayListOf<IrStatement>()
        val loweredFunctionExpression =
            expression.functionExpression.getLoweredAndAddStatements(statements = loweredStatements)
        val loweredArguments =
            expression.arguments.map { it.getLoweredAndAddStatements(statements = loweredStatements) }
        return FunctionApplication(
            functionExpression = loweredFunctionExpression,
            arguments = loweredArguments
        ).asLoweringResult(statements = loweredStatements)
    }

    override fun visit(expression: Expression.Binary, context: Unit): LoweringResult {
        val loweredStatements = arrayListOf<IrStatement>()
        val e1 = expression.e1.getLoweredAndAddStatements(statements = loweredStatements)
        val e2 = expression.e2.getLoweredAndAddStatements(statements = loweredStatements)
        return Binary(operator = expression.operator, e1 = e1, e2 = e2).asLoweringResult(statements = loweredStatements)
    }

    override fun visit(expression: Expression.IfElse, context: Unit): LoweringResult {
        val loweredStatements = arrayListOf<IrStatement>()
        val boolExpression = expression.boolExpression.getLoweredAndAddStatements(statements = loweredStatements)
        val e1LoweringResult = expression.e1.lower()
        val e2LoweringResult = expression.e2.lower()
        if (e1LoweringResult.statements.isEmpty() && e2LoweringResult.statements.isEmpty()) {
            return Ternary(
                boolExpression = boolExpression,
                e1 = e1LoweringResult.expression,
                e2 = e2LoweringResult.expression
            ).asLoweringResult(statements = loweredStatements)
        }
        if (e1LoweringResult.expression == IR_UNIT && e2LoweringResult.expression == IR_UNIT) {
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
        loweredStatements.add(
            element = IfElse(
                booleanExpression = boolExpression,
                s1 = e1LoweringResult.statements.plus(
                    element = VariableAssignment(
                        name = variableForIfElseAssign,
                        assignedExpression = e1LoweringResult.expression
                    )
                ),
                s2 = e2LoweringResult.statements.plus(
                    element = VariableAssignment(
                        name = variableForIfElseAssign,
                        assignedExpression = e2LoweringResult.expression
                    )
                )
            )
        )
        return LoweringResult(
            statements = loweredStatements,
            expression = Variable(name = variableForIfElseAssign)
        )
    }

    override fun visit(expression: Expression.Match, context: Unit): LoweringResult {
        val loweredStatements = arrayListOf<IrStatement>()
        val matchedExpression = expression.matchedExpression.getLoweredAndAddStatements(statements = loweredStatements)
        val variableForMatchedExpression = allocateTemporaryVariable()
        loweredStatements.add(
            element = ConstantDefinition(
                pattern = TsPattern.VariablePattern(name = variableForMatchedExpression),
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
        if (expression.type == Type.unit) {
            loweredStatements.add(
                element = Match(
                    type = expression.type,
                    assignedTemporaryVariable = null,
                    variableForMatchedExpression = variableForMatchedExpression,
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
                    matchingList = loweredMatchingList
                )
            )
            return Variable(name = temporaryVariable).asLoweringResult(statements = loweredStatements)
        }
    }

    override fun visit(expression: Expression.Lambda, context: Unit): LoweringResult {
        val result = expression.body.lower()
        return if (result.expression == IR_UNIT) {
            Lambda(parameters = expression.parameters, body = result.statements).asLoweringResult()
        } else {
            Lambda(
                parameters = expression.parameters,
                body = result.statements.plus(element = Return(expression = result.expression))
            ).asLoweringResult()
        }
    }

    override fun visit(expression: Expression.Val, context: Unit): LoweringResult {
        val loweredStatements = arrayListOf<IrStatement>()
        val loweredAssignedExpression =
            expression.assignedExpression.getLoweredAndAddStatements(statements = loweredStatements)
        val tsPattern = when (val pattern = expression.pattern) {
            is Pattern.TuplePattern -> TsPattern.TuplePattern(destructedNames = pattern.destructedNames)
            is Pattern.ObjectPattern -> TsPattern.ObjectPattern(destructedNames = pattern.destructedNames)
            is Pattern.VariablePattern -> TsPattern.VariablePattern(name = pattern.name)
            is Pattern.WildCardPattern -> TsPattern.WildCardPattern
        }
        loweredStatements.add(
            element = ConstantDefinition(
                pattern = tsPattern,
                typeAnnotation = expression.typeAnnotation,
                assignedExpression = loweredAssignedExpression
            )
        )
        val nextExpression = expression.nextExpression ?: return loweredStatements.asLoweringResult()
        return nextExpression
            .getLoweredAndAddStatements(statements = loweredStatements)
            .asLoweringResult(statements = loweredStatements)
    }
}
