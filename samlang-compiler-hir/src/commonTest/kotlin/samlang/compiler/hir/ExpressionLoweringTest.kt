package samlang.compiler.hir

import kotlin.test.Test
import kotlin.test.assertEquals
import samlang.ast.common.ModuleReference
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
import samlang.ast.lang.Module
import samlang.ast.lang.Pattern
import samlang.ast.lang.Statement
import samlang.ast.lang.StatementBlock

class ExpressionLoweringTest {
    private fun assertCorrectlyLowered(expression: Expression, expected: LoweringResult) {
        assertEquals(
            expected = expected,
            actual = lowerExpression(
                moduleReference = ModuleReference.ROOT,
                module = Module(imports = emptyList(), classDefinitions = emptyList()),
                expression = expression
            )
        )
    }

    private fun assertCorrectlyLowered(expression: Expression, expectedExpression: HighIrExpression) {
        assertEquals(
            expected = LoweringResult(statements = emptyList(), expression = expectedExpression),
            actual = lowerExpression(
                moduleReference = ModuleReference.ROOT,
                module = Module(imports = emptyList(), classDefinitions = emptyList()),
                expression = expression
            )
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
            expression = Expression.TupleConstructor(
                range = dummyRange,
                type = Type.TupleType(mappings = listOf()),
                expressionList = listOf(THIS)
            ),
            expectedExpression = HighIrExpression.StructConstructor(expressionList = listOf(IR_THIS))
        )
    }

    @Test
    fun expressionOnlyLoweringWorks04() {
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
            expectedExpression = HighIrExpression.StructConstructor(
                expressionList = listOf(IR_THIS, HighIrExpression.Variable(name = "bar"))
            )
        )
    }

    @Test
    fun expressionOnlyLoweringWorks05() {
        assertCorrectlyLowered(
            expression = Expression.VariantConstructor(
                range = dummyRange,
                type = id(identifier = "Foo"),
                tag = "Foo",
                tagOrder = 1,
                data = THIS
            ),
            expectedExpression = HighIrExpression.StructConstructor(
                expressionList = listOf(HighIrExpression.literal(value = 1L), IR_THIS)
            )
        )
    }

    @Test
    fun expressionOnlyLoweringWorks06() {
        assertCorrectlyLowered(
            expression = Expression.FieldAccess(
                range = dummyRange, type = unit, expression = THIS, fieldName = "foo", fieldOrder = 0
            ),
            expectedExpression = HighIrExpression.IndexAccess(expression = IR_THIS, index = 0)
        )
    }

    @Test
    fun expressionOnlyLoweringWorks07() {
        assertCorrectlyLowered(
            expression = Unary(range = dummyRange, type = unit, operator = NOT, expression = THIS),
            expectedExpression = HighIrExpression.Unary(operator = NOT, expression = IR_THIS)
        )
    }

    @Test
    fun expressionOnlyLoweringWorks08() {
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
    fun ifElseLoweringWorks() {
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
                    HighIrStatement.IfElse(
                        booleanExpression = IR_THIS,
                        s1 = listOf(
                            HighIrStatement.Throw(expression = IR_THIS),
                            HighIrStatement.LetDefinition(
                                name = "_LOWERING_0",
                                assignedExpression = HighIrExpression.FALSE
                            )
                        ),
                        s2 = listOf(
                            HighIrStatement.LetDefinition(name = "_LOWERING_0", assignedExpression = IR_THIS)
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
                    HighIrStatement.LetDefinition(name = "_LOWERING_0", assignedExpression = IR_THIS),
                    HighIrStatement.Match(
                        assignedTemporaryVariable = "_LOWERING_1",
                        variableForMatchedExpression = "_LOWERING_0",
                        matchingList = listOf(
                            HighIrStatement.Match.VariantPatternToStatement(
                                tagOrder = 0,
                                dataVariable = "bar",
                                statements = emptyList(),
                                finalExpression = IR_THIS
                            ),
                            HighIrStatement.Match.VariantPatternToStatement(
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
                    HighIrStatement.LetDefinition(name = "_LOWERING_0", assignedExpression = IR_THIS),
                    HighIrStatement.Match(
                        assignedTemporaryVariable = "_LOWERING_1",
                        variableForMatchedExpression = "_LOWERING_0",
                        matchingList = listOf(
                            HighIrStatement.Match.VariantPatternToStatement(
                                tagOrder = 0,
                                dataVariable = "bar",
                                statements = emptyList(),
                                finalExpression = IR_THIS
                            ),
                            HighIrStatement.Match.VariantPatternToStatement(
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
            expected = LoweringResult(
                statements = listOf(
                    HighIrStatement.LetDefinition(name = "a", assignedExpression = IR_THIS),
                    HighIrStatement.LetDefinition(
                        name = "a", assignedExpression = HighIrExpression.Variable(name = "a")
                    )
                ),
                expression = HighIrExpression.FALSE
            )
        )
    }

    companion object {
        private val DUMMY_IDENTIFIER_TYPE: Type.IdentifierType = id(identifier = "Dummy")
        private val THIS: Expression = Expression.This(range = dummyRange, type = DUMMY_IDENTIFIER_TYPE)
        private val IR_THIS: HighIrExpression = HighIrExpression.Variable(name = "this")
    }
}
