package samlang.compiler.ts

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.common.BinaryOperator.PLUS
import samlang.ast.common.Literal
import samlang.ast.common.Type
import samlang.ast.common.Type.Companion.int
import samlang.ast.common.Type.Companion.unit
import samlang.ast.common.UnaryOperator.NOT
import samlang.ast.lang.Expression
import samlang.ast.lang.Expression.Unary
import samlang.ast.lang.Pattern
import samlang.ast.ts.TsExpression
import samlang.ast.ts.TsPattern
import samlang.ast.ts.TsStatement
import samlang.ast.common.Range.Companion.DUMMY as dummyRange

class ExpressionLoweringTest : StringSpec() {

    private fun assertCorrectlyLowered(expression: Expression, expected: LoweringResult) {
        lowerExpression(expression = expression) shouldBe expected
    }

    private fun assertCorrectlyLowered(expression: Expression, expectedExpression: TsExpression) {
        lowerExpression(expression = expression) shouldBe LoweringResult(
            statements = emptyList(), expression = expectedExpression
        )
    }

    private fun assertCorrectlyLowered(expression: Expression, expectedStatements: List<TsStatement>) {
        lowerExpression(expression = expression) shouldBe LoweringResult(
            statements = expectedStatements, expression = TS_UNIT
        )
    }

    init {
        "Statement/Expression only lowering works." {
            assertCorrectlyLowered(
                expression = Expression.Literal(range = dummyRange, type = unit, literal = Literal.UnitLiteral),
                expectedExpression = TS_UNIT
            )
            assertCorrectlyLowered(
                expression = Expression.Variable(range = dummyRange, type = unit, name = "foo"),
                expectedExpression = TsExpression.Variable(name = "foo")
            )
            assertCorrectlyLowered(
                expression = Expression.This(range = dummyRange, type = unit),
                expectedExpression = TS_THIS
            )
            assertCorrectlyLowered(
                expression = Expression.ClassMember(range = dummyRange, type = unit, className = "A", memberName = "b"),
                expectedExpression = TsExpression.ClassMember(className = "A", memberName = "b")
            )
            assertCorrectlyLowered(
                expression = Expression.TupleConstructor(
                    range = dummyRange,
                    type = Type.TupleType(mappings = listOf()),
                    expressionList = listOf(THIS)
                ),
                expectedExpression = TsExpression.TupleConstructor(expressionList = listOf(TS_THIS))
            )
            assertCorrectlyLowered(
                expression = Expression.ObjectConstructor(
                    range = dummyRange,
                    type = unit,
                    spreadExpression = THIS,
                    fieldDeclarations = listOf(
                        Expression.ObjectConstructor.FieldConstructor.Field(
                            range = dummyRange, type = unit, name = "foo", expression = THIS
                        ),
                        Expression.ObjectConstructor.FieldConstructor.FieldShorthand(
                            range = dummyRange, type = unit, name = "bar"
                        )
                    )
                ),
                expectedExpression = TsExpression.ObjectConstructor(
                    spreadExpression = TS_THIS,
                    fieldDeclaration = listOf(
                        "foo" to TS_THIS,
                        "bar" to TsExpression.Variable(name = "bar")
                    )
                )
            )
            assertCorrectlyLowered(
                expression = Expression.VariantConstructor(range = dummyRange, type = unit, tag = "Foo", data = THIS),
                expectedExpression = TsExpression.VariantConstructor(tag = "Foo", data = TS_THIS)
            )
            assertCorrectlyLowered(
                expression = Expression.FieldAccess(
                    range = dummyRange, type = unit, expression = THIS, fieldName = "foo"
                ),
                expectedExpression = TsExpression.FieldAccess(expression = TS_THIS, fieldName = "foo")
            )
            assertCorrectlyLowered(
                expression = Expression.MethodAccess(
                    range = dummyRange, type = unit, expression = THIS, methodName = "foo"
                ),
                expectedExpression = TsExpression.MethodAccess(expression = TS_THIS, methodName = "foo")
            )
            assertCorrectlyLowered(
                expression = Unary(range = dummyRange, type = unit, operator = NOT, expression = THIS),
                expectedExpression = TsExpression.Unary(operator = NOT, expression = TS_THIS)
            )
            assertCorrectlyLowered(
                expression = Expression.Panic(range = dummyRange, type = unit, expression = THIS),
                expectedStatements = listOf(TsStatement.Throw(expression = TS_THIS))
            )
            assertCorrectlyLowered(
                expression = Expression.FunctionApplication(
                    range = dummyRange,
                    type = unit,
                    functionExpression = THIS,
                    arguments = listOf(THIS, THIS)
                ),
                expectedExpression = TsExpression.FunctionApplication(
                    functionExpression = TS_THIS, arguments = listOf(TS_THIS, TS_THIS)
                )
            )
            assertCorrectlyLowered(
                expression = Expression.Binary(range = dummyRange, type = unit, operator = PLUS, e1 = THIS, e2 = THIS),
                expectedExpression = TsExpression.Binary(operator = PLUS, e1 = TS_THIS, e2 = TS_THIS)
            )
            assertCorrectlyLowered(
                expression = Expression.IfElse(
                    range = dummyRange, type = unit, boolExpression = THIS, e1 = THIS, e2 = THIS
                ),
                expectedExpression = TsExpression.Ternary(boolExpression = TS_THIS, e1 = TS_THIS, e2 = TS_THIS)
            )
            assertCorrectlyLowered(
                expression = Expression.Lambda(
                    range = dummyRange,
                    type = Type.FunctionType(argumentTypes = emptyList(), returnType = unit),
                    parameters = emptyList(),
                    body = THIS
                ),
                expectedExpression = TsExpression.Lambda(
                    parameters = emptyList(),
                    body = listOf(TsStatement.Return(expression = TS_THIS))
                )
            )
        }
        "If/Else with statements lowering works." {
            assertCorrectlyLowered(
                expression = Expression.IfElse(
                    range = dummyRange,
                    type = unit,
                    boolExpression = THIS,
                    e1 = Expression.Val(
                        range = dummyRange,
                        type = unit,
                        pattern = Pattern.WildCardPattern(range = dummyRange),
                        typeAnnotation = unit,
                        assignedExpression = THIS,
                        nextExpression = null
                    ),
                    e2 = Expression.Val(
                        range = dummyRange,
                        type = unit,
                        pattern = Pattern.WildCardPattern(range = dummyRange),
                        typeAnnotation = unit,
                        assignedExpression = THIS,
                        nextExpression = null
                    )
                ),
                expectedStatements = listOf(
                    TsStatement.IfElse(
                        booleanExpression = TS_THIS,
                        s1 = listOf(
                            TsStatement.ConstantDefinition(
                                pattern = TsPattern.WildCardPattern,
                                typeAnnotation = unit,
                                assignedExpression = TS_THIS
                            )
                        ),
                        s2 = listOf(
                            TsStatement.ConstantDefinition(
                                pattern = TsPattern.WildCardPattern,
                                typeAnnotation = unit,
                                assignedExpression = TS_THIS
                            )
                        )
                    )
                )
            )
            assertCorrectlyLowered(
                expression = Expression.IfElse(
                    range = dummyRange,
                    type = unit,
                    boolExpression = THIS,
                    e1 = Expression.Val(
                        range = dummyRange,
                        type = unit,
                        pattern = Pattern.WildCardPattern(range = dummyRange),
                        typeAnnotation = unit,
                        assignedExpression = THIS,
                        nextExpression = null
                    ),
                    e2 = THIS
                ),
                expected = LoweringResult(
                    statements = listOf(
                        TsStatement.LetDeclaration(name = "_LOWERING_0", typeAnnotation = unit),
                        TsStatement.IfElse(
                            booleanExpression = TS_THIS,
                            s1 = listOf(
                                TsStatement.ConstantDefinition(
                                    pattern = TsPattern.WildCardPattern,
                                    typeAnnotation = unit,
                                    assignedExpression = TS_THIS
                                ),
                                TsStatement.VariableAssignment(name = "_LOWERING_0", assignedExpression = TS_UNIT)
                            ),
                            s2 = listOf(
                                TsStatement.VariableAssignment(name = "_LOWERING_0", assignedExpression = TS_THIS)
                            )
                        )
                    ),
                    expression = TsExpression.Variable(name = "_LOWERING_0")
                )
            )
        }
        "Match lowering works." {
            assertCorrectlyLowered(
                expression = Expression.Match(
                    range = dummyRange,
                    type = unit,
                    matchedExpression = THIS,
                    matchingList = listOf(
                        Expression.Match.VariantPatternToExpr(
                            range = dummyRange, tag = "Foo", dataVariable = "bar", expression = THIS
                        ),
                        Expression.Match.VariantPatternToExpr(
                            range = dummyRange, tag = "Bar", dataVariable = null, expression = THIS
                        )
                    )
                ),
                expectedStatements = listOf(
                    TsStatement.Match(
                        assignedTemporaryVariable = null,
                        matchedExpression = TS_THIS,
                        matchingList = listOf(
                            TsStatement.Match.VariantPatternToStatement(
                                tag = "Foo",
                                dataVariable = "bar",
                                statements = emptyList(),
                                finalExpression = TS_THIS
                            ),
                            TsStatement.Match.VariantPatternToStatement(
                                tag = "Bar",
                                dataVariable = null,
                                statements = emptyList(),
                                finalExpression = TS_THIS
                            )
                        )
                    )
                )
            )
            assertCorrectlyLowered(
                expression = Expression.Match(
                    range = dummyRange,
                    type = int,
                    matchedExpression = THIS,
                    matchingList = listOf(
                        Expression.Match.VariantPatternToExpr(
                            range = dummyRange, tag = "Foo", dataVariable = "bar", expression = THIS
                        ),
                        Expression.Match.VariantPatternToExpr(
                            range = dummyRange, tag = "Bar", dataVariable = null, expression = THIS
                        )
                    )
                ),
                expected = LoweringResult(
                    statements = listOf(
                        TsStatement.Match(
                            assignedTemporaryVariable = "_LOWERING_0",
                            matchedExpression = TS_THIS,
                            matchingList = listOf(
                                TsStatement.Match.VariantPatternToStatement(
                                    tag = "Foo",
                                    dataVariable = "bar",
                                    statements = emptyList(),
                                    finalExpression = TS_THIS
                                ),
                                TsStatement.Match.VariantPatternToStatement(
                                    tag = "Bar",
                                    dataVariable = null,
                                    statements = emptyList(),
                                    finalExpression = TS_THIS
                                )
                            )
                        )
                    ),
                    expression = TsExpression.Variable(name = "_LOWERING_0")
                )
            )
        }
    }

    companion object {
        private val THIS: Expression = Expression.This(range = dummyRange, type = unit)
        private val TS_THIS: TsExpression = TsExpression.Variable(name = "_this")
    }
}
