package samlang.checker

import samlang.ast.common.Type
import samlang.ast.common.TypeDefinitionType
import samlang.ast.lang.Expression
import samlang.ast.lang.Pattern
import samlang.ast.lang.Statement
import samlang.ast.lang.Statement.Val
import samlang.ast.lang.StatementBlock
import samlang.errors.TupleSizeMismatchError
import samlang.errors.UnexpectedTypeKindError
import samlang.errors.UnresolvedNameError

internal class StatementTypeChecker(
    private val accessibleGlobalTypingContext: AccessibleGlobalTypingContext,
    private val errorCollector: ErrorCollector,
    private val expressionTypeChecker: ExpressionTypeCheckerWithContext
) {
    fun typeCheck(
        statementBlock: StatementBlock,
        expectedType: Type,
        localContext: LocalTypingContext
    ): StatementBlock = localContext.withNestedScope {
        typeCheckInNestedScope(
            statementBlock = statementBlock,
            expectedType = expectedType,
            localContext = localContext
        )
    }

    private fun typeCheckInNestedScope(
        statementBlock: StatementBlock,
        expectedType: Type,
        localContext: LocalTypingContext
    ): StatementBlock {
        val checkedStatements = mutableListOf<Statement>()
        for (statement in statementBlock.statements) {
            checkedStatements += typeCheck(
                statement = statement,
                localContext = localContext
            )
        }
        val expression = statementBlock.expression
        val checkedExpression = if (expression != null) {
            expressionTypeChecker.typeCheck(
                expression = expression,
                expectedType = expectedType
            )
        } else {
            // Force the type checker to resolve expected type to unit.
            expressionTypeChecker.typeCheck(
                expression = Expression.Panic(
                    range = statementBlock.range,
                    type = Type.unit,
                    expression = Expression.Literal.ofString(range = statementBlock.range, value = "")
                ),
                expectedType = expectedType
            )
            null
        }
        return statementBlock.copy(statements = checkedStatements, expression = checkedExpression)
    }

    private fun typeCheck(statement: Statement, localContext: LocalTypingContext): Statement =
        when (statement) {
            is Val -> typeCheckVal(statement = statement, localContext = localContext)
        }

    private fun typeCheckVal(statement: Val, localContext: LocalTypingContext): Val {
        val (_, pattern, typeAnnotation, assignedExpression) = statement
        val checkedAssignedExpression = expressionTypeChecker.typeCheck(
            expression = assignedExpression,
            expectedType = typeAnnotation
        )
        val betterStatement = statement.copy(assignedExpression = checkedAssignedExpression)
        val checkedAssignedExprType = checkedAssignedExpression.type
        val checkedPattern = when (pattern) {
            is Pattern.TuplePattern -> {
                val tupleType = checkedAssignedExprType as? Type.TupleType ?: kotlin.run {
                    errorCollector.add(
                        compileTimeError = UnexpectedTypeKindError(
                            expectedTypeKind = "tuple",
                            actualType = checkedAssignedExprType,
                            range = assignedExpression.range
                        )
                    )
                    return betterStatement
                }
                val expectedSize = tupleType.mappings.size
                val actualSize = pattern.destructedNames.size
                if (expectedSize != actualSize) {
                    errorCollector.add(
                        compileTimeError = TupleSizeMismatchError(
                            expectedSize = expectedSize,
                            actualSize = actualSize,
                            range = assignedExpression.range
                        )
                    )
                }
                pattern.destructedNames.zip(tupleType.mappings).asSequence().mapNotNull { (nameWithRange, t) ->
                    val (name, nameRange) = nameWithRange
                    if (name == null) null else Triple(first = name, second = nameRange, third = t)
                }.forEach { (name, nameRange, elementType) ->
                    localContext.addLocalValueType(name = name, type = elementType) {
                        errorCollector.reportCollisionError(name = name, range = nameRange)
                    }
                }
                pattern
            }
            is Pattern.ObjectPattern -> {
                val identifierType = checkedAssignedExprType as? Type.IdentifierType ?: kotlin.run {
                    errorCollector.add(
                        compileTimeError = UnexpectedTypeKindError(
                            expectedTypeKind = "identifier",
                            actualType = checkedAssignedExprType,
                            range = assignedExpression.range
                        )
                    )
                    return betterStatement
                }
                val fieldMappingsOrError = ClassTypeDefinitionResolver.getTypeDefinition(
                    identifierType = identifierType,
                    context = accessibleGlobalTypingContext,
                    typeDefinitionType = TypeDefinitionType.OBJECT,
                    errorRange = assignedExpression.range
                )
                val (fieldNames, fieldMappings) = when (fieldMappingsOrError) {
                    is Either.Left -> fieldMappingsOrError.v
                    is Either.Right -> {
                        errorCollector.add(compileTimeError = fieldMappingsOrError.v)
                        return betterStatement
                    }
                }
                val fieldOrderMapping = fieldNames.asSequence().mapIndexed { index, name -> name to index }.toMap()
                val orderedDestructuredName = pattern.destructedNames.map { destructuredName ->
                    val (originalName, _, renamedName, fieldRange) = destructuredName
                    val (fieldType, isPublic) = fieldMappings[originalName] ?: kotlin.run {
                        errorCollector.add(UnresolvedNameError(unresolvedName = originalName, range = fieldRange))
                        return betterStatement
                    }
                    if (identifierType.identifier != accessibleGlobalTypingContext.currentClass && !isPublic) {
                        errorCollector.add(UnresolvedNameError(unresolvedName = originalName, range = fieldRange))
                        return betterStatement
                    }
                    val nameToBeUsed = renamedName ?: originalName
                    localContext.addLocalValueType(name = nameToBeUsed, type = fieldType) {
                        errorCollector.reportCollisionError(name = nameToBeUsed, range = fieldRange)
                    }
                    val order = fieldOrderMapping[originalName] ?: error(message = "Bad field!")
                    destructuredName.copy(fieldOrder = order)
                }.sortedBy { it.fieldOrder }
                pattern.copy(destructedNames = orderedDestructuredName)
            }
            is Pattern.VariablePattern -> {
                val (p, n) = pattern
                localContext.addLocalValueType(name = n, type = checkedAssignedExprType) {
                    errorCollector.reportCollisionError(name = n, range = p)
                }
                pattern
            }
            is Pattern.WildCardPattern -> pattern
        }
        return betterStatement.copy(pattern = checkedPattern)
    }
}
