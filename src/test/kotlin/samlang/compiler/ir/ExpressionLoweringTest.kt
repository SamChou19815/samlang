package samlang.compiler.ir

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.common.BinaryOperator.PLUS
import samlang.ast.common.Literal
import samlang.ast.common.Type
import samlang.ast.common.Type.Companion.int
import samlang.ast.common.Type.Companion.unit
import samlang.ast.common.UnaryOperator.NOT
import samlang.ast.ir.IrExpression
import samlang.ast.ir.IrStatement
import samlang.ast.lang.Expression
import samlang.ast.lang.Expression.Unary
import samlang.ast.lang.Pattern
import samlang.ast.ts.TsPattern
import samlang.ast.common.Range.Companion.DUMMY as dummyRange

class ExpressionLoweringTest : StringSpec() {

    private fun assertCorrectlyLowered(expression: Expression, expected: LoweringResult) {
        lowerExpression(expression = expression) shouldBe expected
    }

    private fun assertCorrectlyLowered(expression: Expression, expectedExpression: IrExpression) {
        lowerExpression(expression = expression) shouldBe LoweringResult(
            statements = emptyList(), expression = expectedExpression
        )
    }

    private fun assertCorrectlyLowered(expression: Expression, expectedStatements: List<IrStatement>) {
        lowerExpression(expression = expression) shouldBe LoweringResult(
            statements = expectedStatements, expression = IR_UNIT
        )
    }

    init {
        "Statement/Expression only lowering works." {
            assertCorrectlyLowered(
                expression = Expression.Literal(range = dummyRange, type = unit, literal = Literal.UNIT),
                expectedExpression = IR_UNIT
            )
            assertCorrectlyLowered(
                expression = Expression.Variable(range = dummyRange, type = unit, name = "foo"),
                expectedExpression = IrExpression.Variable(name = "foo")
            )
            assertCorrectlyLowered(
                expression = Expression.This(range = dummyRange, type = unit),
                expectedExpression = IR_THIS
            )
            assertCorrectlyLowered(
                expression = Expression.ClassMember(range = dummyRange, type = unit, className = "A", memberName = "b"),
                expectedExpression = IrExpression.ClassMember(className = "A", memberName = "b")
            )
            assertCorrectlyLowered(
                expression = Expression.TupleConstructor(
                    range = dummyRange,
                    type = Type.TupleType(mappings = listOf()),
                    expressionList = listOf(THIS)
                ),
                expectedExpression = IrExpression.TupleConstructor(expressionList = listOf(IR_THIS))
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
                expectedExpression = IrExpression.ObjectConstructor(
                    spreadExpression = IR_THIS,
                    fieldDeclaration = listOf(
                        "foo" to IR_THIS,
                        "bar" to IrExpression.Variable(name = "bar")
                    )
                )
            )
            assertCorrectlyLowered(
                expression = Expression.VariantConstructor(range = dummyRange, type = unit, tag = "Foo", data = THIS),
                expectedExpression = IrExpression.VariantConstructor(tag = "Foo", data = IR_THIS)
            )
            assertCorrectlyLowered(
                expression = Expression.FieldAccess(
                    range = dummyRange, type = unit, expression = THIS, fieldName = "foo"
                ),
                expectedExpression = IrExpression.FieldAccess(expression = IR_THIS, fieldName = "foo")
            )
            assertCorrectlyLowered(
                expression = Expression.MethodAccess(
                    range = dummyRange, type = unit, expression = THIS, methodName = "foo"
                ),
                expectedExpression = IrExpression.MethodAccess(expression = IR_THIS, methodName = "foo")
            )
            assertCorrectlyLowered(
                expression = Unary(range = dummyRange, type = unit, operator = NOT, expression = THIS),
                expectedExpression = IrExpression.Unary(operator = NOT, expression = IR_THIS)
            )
            assertCorrectlyLowered(
                expression = Expression.Panic(range = dummyRange, type = unit, expression = THIS),
                expectedStatements = listOf(IrStatement.Throw(expression = IR_THIS))
            )
            assertCorrectlyLowered(
                expression = Expression.FunctionApplication(
                    range = dummyRange,
                    type = unit,
                    functionExpression = THIS,
                    arguments = listOf(
                        THIS,
                        THIS
                    )
                ),
                expectedExpression = IrExpression.FunctionApplication(
                    functionExpression = IR_THIS, arguments = listOf(
                        IR_THIS,
                        IR_THIS
                    )
                )
            )
            assertCorrectlyLowered(
                expression = Expression.Binary(range = dummyRange, type = unit, operator = PLUS, e1 = THIS, e2 = THIS),
                expectedExpression = IrExpression.Binary(operator = PLUS, e1 = IR_THIS, e2 = IR_THIS)
            )
            assertCorrectlyLowered(
                expression = Expression.IfElse(
                    range = dummyRange, type = unit, boolExpression = THIS, e1 = THIS, e2 = THIS
                ),
                expectedExpression = IrExpression.Ternary(boolExpression = IR_THIS, e1 = IR_THIS, e2 = IR_THIS)
            )
            assertCorrectlyLowered(
                expression = Expression.Lambda(
                    range = dummyRange,
                    type = Type.FunctionType(argumentTypes = emptyList(), returnType = unit),
                    parameters = emptyList(),
                    body = THIS
                ),
                expectedExpression = IrExpression.Lambda(
                    parameters = emptyList(),
                    body = listOf(IrStatement.Return(expression = IR_THIS))
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
                    IrStatement.IfElse(
                        booleanExpression = IR_THIS,
                        s1 = listOf(
                            IrStatement.ConstantDefinition(
                                pattern = TsPattern.WildCardPattern,
                                typeAnnotation = unit,
                                assignedExpression = IR_THIS
                            )
                        ),
                        s2 = listOf(
                            IrStatement.ConstantDefinition(
                                pattern = TsPattern.WildCardPattern,
                                typeAnnotation = unit,
                                assignedExpression = IR_THIS
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
                        IrStatement.LetDeclaration(name = "_LOWERING_0", typeAnnotation = unit),
                        IrStatement.IfElse(
                            booleanExpression = IR_THIS,
                            s1 = listOf(
                                IrStatement.ConstantDefinition(
                                    pattern = TsPattern.WildCardPattern,
                                    typeAnnotation = unit,
                                    assignedExpression = IR_THIS
                                ),
                                IrStatement.VariableAssignment(
                                    name = "_LOWERING_0",
                                    assignedExpression = IR_UNIT
                                )
                            ),
                            s2 = listOf(
                                IrStatement.VariableAssignment(name = "_LOWERING_0", assignedExpression = IR_THIS)
                            )
                        )
                    ),
                    expression = IrExpression.Variable(name = "_LOWERING_0")
                )
            )
        }

        "If/Else with panic in one branch lowering works." {
            assertCorrectlyLowered(
                expression = Expression.IfElse(
                    range = dummyRange,
                    type = unit,
                    boolExpression = THIS,
                    e1 = Expression.Panic(range = dummyRange, type = unit, expression = THIS),
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
                    IrStatement.IfElse(
                        booleanExpression = IR_THIS,
                        s1 = listOf(IrStatement.Throw(expression = IR_THIS)),
                        s2 = listOf(
                            IrStatement.ConstantDefinition(
                                pattern = TsPattern.WildCardPattern,
                                typeAnnotation = unit,
                                assignedExpression = IR_THIS
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
                    e1 = Expression.Panic(range = dummyRange, type = unit, expression = THIS),
                    e2 = THIS
                ),
                expected = LoweringResult(
                    statements = listOf(
                        IrStatement.LetDeclaration(name = "_LOWERING_0", typeAnnotation = unit),
                        IrStatement.IfElse(
                            booleanExpression = IR_THIS,
                            s1 = listOf(
                                IrStatement.Throw(expression = IR_THIS),
                                IrStatement.VariableAssignment(name = "_LOWERING_0", assignedExpression = IR_UNIT)
                            ),
                            s2 = listOf(
                                IrStatement.VariableAssignment(name = "_LOWERING_0", assignedExpression = IR_THIS)
                            )
                        )
                    ),
                    expression = IrExpression.Variable(name = "_LOWERING_0")
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
                    IrStatement.ConstantDefinition(
                        pattern = TsPattern.VariablePattern(name = "_LOWERING_0"),
                        typeAnnotation = unit,
                        assignedExpression = IR_THIS
                    ),
                    IrStatement.Match(
                        type = unit,
                        assignedTemporaryVariable = null,
                        variableForMatchedExpression = "_LOWERING_0",
                        matchingList = listOf(
                            IrStatement.Match.VariantPatternToStatement(
                                tag = "Foo",
                                dataVariable = "bar",
                                statements = emptyList(),
                                finalExpression = IR_THIS
                            ),
                            IrStatement.Match.VariantPatternToStatement(
                                tag = "Bar",
                                dataVariable = null,
                                statements = emptyList(),
                                finalExpression = IR_THIS
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
                        IrStatement.ConstantDefinition(
                            pattern = TsPattern.VariablePattern(name = "_LOWERING_0"),
                            typeAnnotation = unit,
                            assignedExpression = IR_THIS
                        ),
                        IrStatement.Match(
                            type = int,
                            assignedTemporaryVariable = "_LOWERING_1",
                            variableForMatchedExpression = "_LOWERING_0",
                            matchingList = listOf(
                                IrStatement.Match.VariantPatternToStatement(
                                    tag = "Foo",
                                    dataVariable = "bar",
                                    statements = emptyList(),
                                    finalExpression = IR_THIS
                                ),
                                IrStatement.Match.VariantPatternToStatement(
                                    tag = "Bar",
                                    dataVariable = null,
                                    statements = emptyList(),
                                    finalExpression = IR_THIS
                                )
                            )
                        )
                    ),
                    expression = IrExpression.Variable(name = "_LOWERING_1")
                )
            )
        }
    }

    companion object {
        private val THIS: Expression = Expression.This(range = dummyRange, type = unit)
        private val IR_THIS: IrExpression = IrExpression.Variable(name = "_this")
    }
}
