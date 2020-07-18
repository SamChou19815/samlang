package samlang.compiler.hir

import kotlin.test.Test
import kotlin.test.assertEquals
import samlang.ast.common.BinaryOperator.PLUS
import samlang.ast.common.Range.Companion.DUMMY as dummyRange
import samlang.ast.common.Type
import samlang.ast.common.Type.Companion.id
import samlang.ast.common.Type.Companion.int
import samlang.ast.common.Type.Companion.unit
import samlang.ast.common.UnaryOperator.NOT
import samlang.ast.hir.HighIrExpression
import samlang.ast.hir.HighIrStatement
import samlang.ast.lang.Expression
import samlang.ast.lang.Expression.Unary
import samlang.ast.lang.Pattern
import samlang.ast.lang.Statement
import samlang.ast.lang.StatementBlock

class ExpressionLoweringTest {
    private fun assertCorrectlyLowered(expression: Expression, expected: LoweringResult) {
        assertEquals(expected = expected, actual = lowerExpression(expression = expression))
    }

    private fun assertCorrectlyLowered(expression: Expression, expectedExpression: HighIrExpression) {
        assertEquals(
            expected = LoweringResult(statements = emptyList(), expression = expectedExpression),
            actual = lowerExpression(expression = expression)
        )
    }

    private fun assertCorrectlyLowered(expression: Expression, expectedStatements: List<HighIrStatement>) {
        assertEquals(
            expected = LoweringResult(statements = expectedStatements, expression = null),
            actual = lowerExpression(expression = expression)
        )
    }

    @Test
    fun expressionOnlyLoweringWorks01() {
        assertCorrectlyLowered(
            expression = Expression.Variable(range = dummyRange, type = unit, name = "foo"),
            expectedExpression = HighIrExpression.Variable(name = "foo")
        )
    }

    @Test
    fun expressionOnlyLoweringWorks02() {
        assertCorrectlyLowered(
            expression = Expression.This(range = dummyRange, type = DUMMY_IDENTIFIER_TYPE),
            expectedExpression = IR_THIS
        )
    }

    @Test
    fun expressionOnlyLoweringWorks03() {
        assertCorrectlyLowered(
            expression = Expression.ClassMember(
                range = dummyRange,
                type = unit,
                typeArguments = emptyList(),
                className = "A",
                classNameRange = dummyRange,
                memberName = "b"
            ),
            expectedExpression = HighIrExpression.ClassMember(
                className = "A",
                memberName = "b"
            )
        )
    }

    @Test
    fun expressionOnlyLoweringWorks04() {
        assertCorrectlyLowered(
            expression = Expression.TupleConstructor(
                range = dummyRange,
                type = Type.TupleType(mappings = listOf()),
                expressionList = listOf(THIS)
            ),
            expectedExpression = HighIrExpression.TupleConstructor(expressionList = listOf(IR_THIS))
        )
    }

    @Test
    fun expressionOnlyLoweringWorks05() {
        assertCorrectlyLowered(
            expression = Expression.ObjectConstructor(
                range = dummyRange,
                type = id(identifier = "Foo"),
                fieldDeclarations = listOf(
                    Expression.ObjectConstructor.FieldConstructor.Field(
                        range = dummyRange, type = unit, name = "foo", expression = THIS
                    ),
                    Expression.ObjectConstructor.FieldConstructor.FieldShorthand(
                        range = dummyRange, type = unit, name = "bar"
                    )
                )
            ),
            expectedExpression = HighIrExpression.ObjectConstructor(
                fieldDeclaration = listOf(
                    "foo" to IR_THIS,
                    "bar" to HighIrExpression.Variable(name = "bar")
                )
            )
        )
    }

    @Test
    fun expressionOnlyLoweringWorks06() {
        assertCorrectlyLowered(
            expression = Expression.VariantConstructor(
                range = dummyRange,
                type = id(identifier = "Foo"),
                tag = "Foo",
                tagOrder = 1,
                data = THIS
            ),
            expectedExpression = HighIrExpression.VariantConstructor(tag = "Foo", tagOrder = 1, data = IR_THIS)
        )
    }

    @Test
    fun expressionOnlyLoweringWorks07() {
        assertCorrectlyLowered(
            expression = Expression.FieldAccess(
                range = dummyRange, type = unit, expression = THIS, fieldName = "foo", fieldOrder = 0
            ),
            expectedExpression = HighIrExpression.IndexAccess(expression = IR_THIS, index = 0)
        )
    }

    @Test
    fun expressionOnlyLoweringWorks08() {
        assertCorrectlyLowered(
            expression = Expression.MethodAccess(
                range = dummyRange, type = unit, expression = THIS, methodName = "foo"
            ),
            expectedExpression = HighIrExpression.MethodAccess(
                expression = IR_THIS,
                className = DUMMY_IDENTIFIER_TYPE.identifier,
                methodName = "foo"
            )
        )
    }

    @Test
    fun expressionOnlyLoweringWorks09() {
        assertCorrectlyLowered(
            expression = Unary(range = dummyRange, type = unit, operator = NOT, expression = THIS),
            expectedExpression = HighIrExpression.Unary(operator = NOT, expression = IR_THIS)
        )
    }

    @Test
    fun expressionOnlyLoweringWorks10() {
        assertCorrectlyLowered(
            expression = Expression.FunctionApplication(
                range = dummyRange,
                type = int,
                functionExpression = Expression.ClassMember(
                    range = dummyRange,
                    type = int,
                    typeArguments = listOf(int),
                    className = "Foo",
                    classNameRange = dummyRange,
                    memberName = "bar"
                ),
                arguments = listOf(THIS, THIS)
            ),
            expectedExpression = HighIrExpression.FunctionApplication(
                className = "Foo",
                functionName = "bar",
                arguments = listOf(IR_THIS, IR_THIS)
            )
        )
    }

    @Test
    fun expressionOnlyLoweringWorks11() {
        assertCorrectlyLowered(
            expression = Expression.FunctionApplication(
                range = dummyRange,
                type = int,
                functionExpression = Expression.MethodAccess(
                    range = dummyRange,
                    type = int,
                    expression = THIS,
                    methodName = "fooBar"
                ),
                arguments = listOf(THIS, THIS)
            ),
            expectedExpression = HighIrExpression.MethodApplication(
                objectExpression = IR_THIS,
                className = DUMMY_IDENTIFIER_TYPE.identifier,
                methodName = "fooBar",
                arguments = listOf(IR_THIS, IR_THIS)
            )
        )
    }

    @Test
    fun expressionOnlyLoweringWorks12() {
        assertCorrectlyLowered(
            expression = Expression.FunctionApplication(
                range = dummyRange,
                type = int,
                functionExpression = THIS,
                arguments = listOf(THIS, THIS)
            ),
            expectedExpression = HighIrExpression.ClosureApplication(
                functionExpression = IR_THIS, arguments = listOf(IR_THIS, IR_THIS)
            )
        )
    }

    @Test
    fun expressionOnlyLoweringWorks13() {
        assertCorrectlyLowered(
            expression = Expression.Binary(range = dummyRange, type = unit, operator = PLUS, e1 = THIS, e2 = THIS),
            expectedExpression = HighIrExpression.Binary(operator = PLUS, e1 = IR_THIS, e2 = IR_THIS)
        )
    }

    @Test
    fun expressionOnlyLoweringWorks14() {
        assertCorrectlyLowered(
            expression = Expression.IfElse(
                range = dummyRange, type = unit, boolExpression = THIS, e1 = THIS, e2 = THIS
            ),
            expectedExpression = HighIrExpression.Ternary(boolExpression = IR_THIS, e1 = IR_THIS, e2 = IR_THIS)
        )
    }

    @Test
    fun expressionOnlyLoweringWorks15() {
        assertCorrectlyLowered(
            expression = Expression.Lambda(
                range = dummyRange,
                type = Type.FunctionType(argumentTypes = emptyList(), returnType = unit),
                parameters = emptyList(),
                captured = emptyMap(),
                body = THIS
            ),
            expectedExpression = HighIrExpression.Lambda(
                parameters = emptyList(),
                hasReturn = false,
                captured = emptyList(),
                body = listOf(HighIrStatement.Return(expression = IR_THIS))
            )
        )
    }

    @Test
    fun statementOnlyLoweringWorks1() {
        assertCorrectlyLowered(
            expression = Expression.Panic(range = dummyRange, type = unit, expression = THIS),
            expectedStatements = listOf(HighIrStatement.Throw(expression = IR_THIS))
        )
    }

    @Test
    fun statementOnlyLoweringWorks2() {
        assertCorrectlyLowered(
            expression = Expression.FunctionApplication(
                range = dummyRange,
                type = unit,
                functionExpression = THIS,
                arguments = listOf(THIS, THIS)
            ),
            expectedStatements = listOf(
                HighIrStatement.ExpressionAsStatement(
                    expressionWithPotentialSideEffect = HighIrExpression.ClosureApplication(
                        functionExpression = IR_THIS, arguments = listOf(IR_THIS, IR_THIS)
                    )
                )
            )
        )
    }

    @Test
    fun ifElseLoweringWorks1() {
        assertCorrectlyLowered(
            expression = Expression.IfElse(
                range = dummyRange,
                type = unit,
                boolExpression = THIS,
                e1 = Expression.StatementBlockExpression(
                    range = dummyRange,
                    type = unit,
                    block = StatementBlock(
                        range = dummyRange,
                        statements = listOf(
                            Statement.Val(
                                range = dummyRange,
                                pattern = Pattern.WildCardPattern(range = dummyRange),
                                typeAnnotation = unit,
                                assignedExpression = THIS
                            )
                        ),
                        expression = null
                    )
                ),
                e2 = Expression.StatementBlockExpression(
                    range = dummyRange,
                    type = unit,
                    block = StatementBlock(
                        range = dummyRange,
                        statements = listOf(
                            Statement.Val(
                                range = dummyRange,
                                pattern = Pattern.WildCardPattern(range = dummyRange),
                                typeAnnotation = unit,
                                assignedExpression = THIS
                            )
                        ),
                        expression = null
                    )
                )
            ),
            expectedStatements = listOf(
                HighIrStatement.IfElse(
                    booleanExpression = IR_THIS,
                    s1 = listOf(HighIrStatement.ExpressionAsStatement(expressionWithPotentialSideEffect = IR_THIS)),
                    s2 = listOf(HighIrStatement.ExpressionAsStatement(expressionWithPotentialSideEffect = IR_THIS))
                )
            )
        )
    }

    @Test
    fun ifElseLoweringWorks2() {
        assertCorrectlyLowered(
            expression = Expression.IfElse(
                range = dummyRange,
                type = unit,
                boolExpression = THIS,
                e1 = Expression.StatementBlockExpression(
                    range = dummyRange,
                    type = unit,
                    block = StatementBlock(
                        range = dummyRange,
                        statements = listOf(
                            Statement.Val(
                                range = dummyRange,
                                pattern = Pattern.WildCardPattern(range = dummyRange),
                                typeAnnotation = unit,
                                assignedExpression = THIS
                            )
                        ),
                        expression = null
                    )
                ),
                e2 = Expression.StatementBlockExpression(
                    range = dummyRange,
                    type = unit,
                    block = StatementBlock(range = dummyRange, statements = emptyList(), expression = null)
                )
            ),
            expectedStatements = listOf(
                HighIrStatement.IfElse(
                    booleanExpression = IR_THIS,
                    s1 = listOf(HighIrStatement.ExpressionAsStatement(expressionWithPotentialSideEffect = IR_THIS)),
                    s2 = emptyList()
                )
            )
        )
    }

    @Test
    fun ifElseLoweringWorks3() {
        assertCorrectlyLowered(
            expression = Expression.IfElse(
                range = dummyRange,
                type = unit,
                boolExpression = THIS,
                e1 = Expression.Panic(range = dummyRange, type = unit, expression = THIS),
                e2 = Expression.StatementBlockExpression(
                    range = dummyRange,
                    type = unit,
                    block = StatementBlock(
                        range = dummyRange,
                        statements = listOf(
                            Statement.Val(
                                range = dummyRange,
                                pattern = Pattern.WildCardPattern(range = dummyRange),
                                typeAnnotation = unit,
                                assignedExpression = THIS
                            )
                        ),
                        expression = null
                    )
                )
            ),
            expectedStatements = listOf(
                HighIrStatement.IfElse(
                    booleanExpression = IR_THIS,
                    s1 = listOf(HighIrStatement.Throw(expression = IR_THIS)),
                    s2 = listOf(HighIrStatement.ExpressionAsStatement(expressionWithPotentialSideEffect = IR_THIS))
                )
            )
        )
    }

    @Test
    fun ifElseLoweringWorks4() {
        assertCorrectlyLowered(
            expression = Expression.IfElse(
                range = dummyRange,
                type = unit,
                boolExpression = THIS,
                e1 = Expression.Panic(range = dummyRange, type = unit, expression = THIS),
                e2 = THIS
            ),
            expected = LoweringResult(
                statements = listOf(
                    HighIrStatement.LetDeclaration(name = "_LOWERING_0"),
                    HighIrStatement.IfElse(
                        booleanExpression = IR_THIS,
                        s1 = listOf(HighIrStatement.Throw(expression = IR_THIS)),
                        s2 = listOf(
                            HighIrStatement.VariableAssignment(name = "_LOWERING_0", assignedExpression = IR_THIS)
                        )
                    )
                ),
                expression = HighIrExpression.Variable(name = "_LOWERING_0")
            )
        )
    }

    @Test
    fun matchLoweringWorks1() {
        assertCorrectlyLowered(
            expression = Expression.Match(
                range = dummyRange,
                type = DUMMY_IDENTIFIER_TYPE,
                matchedExpression = THIS,
                matchingList = listOf(
                    Expression.Match.VariantPatternToExpr(
                        range = dummyRange, tag = "Foo", tagOrder = 0, dataVariable = "bar", expression = THIS
                    ),
                    Expression.Match.VariantPatternToExpr(
                        range = dummyRange, tag = "Bar", tagOrder = 1, dataVariable = null, expression = THIS
                    )
                )
            ),
            expected = LoweringResult(
                statements = listOf(
                    HighIrStatement.ConstantDefinition(name = "_LOWERING_0", assignedExpression = IR_THIS),
                    HighIrStatement.Match(
                        assignedTemporaryVariable = "_LOWERING_1",
                        variableForMatchedExpression = "_LOWERING_0",
                        matchingList = listOf(
                            HighIrStatement.Match.VariantPatternToStatement(
                                tag = "Foo",
                                tagOrder = 0,
                                dataVariable = "bar",
                                statements = emptyList(),
                                finalExpression = IR_THIS
                            ),
                            HighIrStatement.Match.VariantPatternToStatement(
                                tag = "Bar",
                                tagOrder = 1,
                                dataVariable = null,
                                statements = emptyList(),
                                finalExpression = IR_THIS
                            )
                        )
                    )
                ),
                expression = HighIrExpression.Variable(name = "_LOWERING_1")
            )
        )
    }

    @Test
    fun matchLoweringWorks2() {
        assertCorrectlyLowered(
            expression = Expression.Match(
                range = dummyRange,
                type = int,
                matchedExpression = THIS,
                matchingList = listOf(
                    Expression.Match.VariantPatternToExpr(
                        range = dummyRange, tag = "Foo", tagOrder = 0, dataVariable = "bar", expression = THIS
                    ),
                    Expression.Match.VariantPatternToExpr(
                        range = dummyRange, tag = "Bar", tagOrder = 1, dataVariable = null, expression = THIS
                    )
                )
            ),
            expected = LoweringResult(
                statements = listOf(
                    HighIrStatement.ConstantDefinition(name = "_LOWERING_0", assignedExpression = IR_THIS),
                    HighIrStatement.Match(
                        assignedTemporaryVariable = "_LOWERING_1",
                        variableForMatchedExpression = "_LOWERING_0",
                        matchingList = listOf(
                            HighIrStatement.Match.VariantPatternToStatement(
                                tag = "Foo",
                                tagOrder = 0,
                                dataVariable = "bar",
                                statements = emptyList(),
                                finalExpression = IR_THIS
                            ),
                            HighIrStatement.Match.VariantPatternToStatement(
                                tag = "Bar",
                                tagOrder = 1,
                                dataVariable = null,
                                statements = emptyList(),
                                finalExpression = IR_THIS
                            )
                        )
                    )
                ),
                expression = HighIrExpression.Variable(name = "_LOWERING_1")
            )
        )
    }

    @Test
    fun loweringScopeTest() {
        assertCorrectlyLowered(
            expression = Expression.StatementBlockExpression(
                range = dummyRange,
                type = unit,
                block = StatementBlock(
                    range = dummyRange,
                    statements = listOf(
                        Statement.Val(
                            range = dummyRange,
                            pattern = Pattern.VariablePattern(range = dummyRange, name = "a"),
                            typeAnnotation = unit,
                            assignedExpression = Expression.StatementBlockExpression(
                                range = dummyRange,
                                type = unit,
                                block = StatementBlock(
                                    range = dummyRange,
                                    statements = listOf(
                                        Statement.Val(
                                            range = dummyRange,
                                            pattern = Pattern.VariablePattern(range = dummyRange, name = "a"),
                                            typeAnnotation = unit,
                                            assignedExpression = THIS
                                        )
                                    ),
                                    expression = Expression.Variable(range = dummyRange, type = unit, name = "a")
                                )
                            )
                        )
                    ),
                    expression = null
                )
            ),
            expectedStatements = listOf(
                HighIrStatement.LetDeclaration(name = "_LOWERING_0"),
                HighIrStatement.ConstantDefinition(name = "a", assignedExpression = IR_THIS),
                HighIrStatement.VariableAssignment(
                    name = "_LOWERING_0",
                    assignedExpression = HighIrExpression.Variable(name = "a")
                ),
                HighIrStatement.ConstantDefinition(
                    name = "a",
                    assignedExpression = HighIrExpression.Variable(name = "_LOWERING_0")
                )
            )
        )
    }

    companion object {
        private val DUMMY_IDENTIFIER_TYPE: Type.IdentifierType = id(identifier = "Dummy")
        private val THIS: Expression = Expression.This(range = dummyRange, type = DUMMY_IDENTIFIER_TYPE)
        private val IR_THIS: HighIrExpression = HighIrExpression.Variable(name = "this")
    }
}
