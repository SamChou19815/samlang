package samlang.compiler.ir

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.common.BinaryOperator.PLUS
import samlang.ast.common.Range.Companion.DUMMY as dummyRange
import samlang.ast.common.Type
import samlang.ast.common.Type.Companion.id
import samlang.ast.common.Type.Companion.int
import samlang.ast.common.Type.Companion.unit
import samlang.ast.common.UnaryOperator.NOT
import samlang.ast.hir.HighIrExpression
import samlang.ast.hir.HighIrPattern
import samlang.ast.hir.HighIrStatement
import samlang.ast.lang.Expression
import samlang.ast.lang.Expression.Unary
import samlang.ast.lang.Pattern
import samlang.ast.lang.Statement
import samlang.ast.lang.StatementBlock

class ExpressionLoweringTest : StringSpec() {

    private fun assertCorrectlyLowered(expression: Expression, expected: LoweringResult) {
        lowerExpression(expression = expression) shouldBe expected
    }

    private fun assertCorrectlyLowered(expression: Expression, expectedExpression: HighIrExpression) {
        lowerExpression(expression = expression) shouldBe LoweringResult(
            statements = emptyList(), expression = expectedExpression
        )
    }

    private fun assertCorrectlyLowered(expression: Expression, expectedStatements: List<HighIrStatement>) {
        lowerExpression(expression = expression) shouldBe LoweringResult(
            statements = expectedStatements, expression = HighIrExpression.UNIT
        )
    }

    init {
        "Statement/Expression only lowering works." {
            assertCorrectlyLowered(
                expression = Expression.Literal.ofUnit(range = dummyRange),
                expectedExpression = HighIrExpression.UNIT
            )
            assertCorrectlyLowered(
                expression = Expression.Variable(range = dummyRange, type = unit, name = "foo"),
                expectedExpression = HighIrExpression.Variable(type = unit, name = "foo")
            )
            assertCorrectlyLowered(
                expression = Expression.This(range = dummyRange, type = DUMMY_IDENTIFIER_TYPE),
                expectedExpression = IR_THIS
            )
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
                    type = unit,
                    typeArguments = emptyList(),
                    className = "A",
                    memberName = "b"
                )
            )
            assertCorrectlyLowered(
                expression = Expression.TupleConstructor(
                    range = dummyRange,
                    type = Type.TupleType(mappings = listOf()),
                    expressionList = listOf(THIS)
                ),
                expectedExpression = HighIrExpression.TupleConstructor(
                    type = Type.TupleType(mappings = listOf()),
                    expressionList = listOf(IR_THIS)
                )
            )
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
                    type = id(identifier = "Foo"),
                    fieldDeclaration = listOf(
                        "foo" to IR_THIS,
                        "bar" to HighIrExpression.Variable(type = unit, name = "bar")
                    )
                )
            )
            assertCorrectlyLowered(
                expression = Expression.VariantConstructor(
                    range = dummyRange,
                    type = id(identifier = "Foo"),
                    tag = "Foo",
                    data = THIS
                ),
                expectedExpression = HighIrExpression.VariantConstructor(
                    type = id(identifier = "Foo"),
                    tag = "Foo",
                    data = IR_THIS
                )
            )
            assertCorrectlyLowered(
                expression = Expression.FieldAccess(
                    range = dummyRange, type = unit, expression = THIS, fieldName = "foo"
                ),
                expectedExpression = HighIrExpression.FieldAccess(type = unit, expression = IR_THIS, fieldName = "foo")
            )
            assertCorrectlyLowered(
                expression = Expression.MethodAccess(
                    range = dummyRange, type = unit, expression = THIS, methodName = "foo"
                ),
                expectedExpression = HighIrExpression.MethodAccess(
                    type = unit,
                    expression = IR_THIS,
                    methodName = "foo"
                )
            )
            assertCorrectlyLowered(
                expression = Unary(range = dummyRange, type = unit, operator = NOT, expression = THIS),
                expectedExpression = HighIrExpression.Unary(type = unit, operator = NOT, expression = IR_THIS)
            )
            assertCorrectlyLowered(
                expression = Expression.Panic(range = dummyRange, type = unit, expression = THIS),
                expected = LoweringResult(
                    statements = listOf(HighIrStatement.Throw(expression = IR_THIS)),
                    expression = HighIrExpression.Never
                )
            )
            assertCorrectlyLowered(
                expression = Expression.FunctionApplication(
                    range = dummyRange,
                    type = unit,
                    functionExpression = THIS,
                    arguments = listOf(THIS, THIS)
                ),
                expectedExpression = HighIrExpression.FunctionApplication(
                    type = unit, functionExpression = IR_THIS, arguments = listOf(IR_THIS, IR_THIS)
                )
            )
            assertCorrectlyLowered(
                expression = Expression.Binary(range = dummyRange, type = unit, operator = PLUS, e1 = THIS, e2 = THIS),
                expectedExpression = HighIrExpression.Binary(type = unit, operator = PLUS, e1 = IR_THIS, e2 = IR_THIS)
            )
            assertCorrectlyLowered(
                expression = Expression.IfElse(
                    range = dummyRange, type = unit, boolExpression = THIS, e1 = THIS, e2 = THIS
                ),
                expectedExpression = HighIrExpression.Ternary(
                    type = unit, boolExpression = IR_THIS, e1 = IR_THIS, e2 = IR_THIS
                )
            )
            assertCorrectlyLowered(
                expression = Expression.Lambda(
                    range = dummyRange,
                    type = Type.FunctionType(argumentTypes = emptyList(), returnType = unit),
                    parameters = emptyList(),
                    body = THIS
                ),
                expectedExpression = HighIrExpression.Lambda(
                    parameters = emptyList(),
                    type = Type.FunctionType(argumentTypes = emptyList(), returnType = unit),
                    body = listOf(HighIrStatement.Return(expression = IR_THIS))
                )
            )
        }

        "If/Else with statements lowering works." {
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
                        s1 = listOf(
                            HighIrStatement.ConstantDefinition(
                                pattern = HighIrPattern.WildCardPattern,
                                typeAnnotation = unit,
                                assignedExpression = IR_THIS
                            )
                        ),
                        s2 = listOf(
                            HighIrStatement.ConstantDefinition(
                                pattern = HighIrPattern.WildCardPattern,
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
                    e2 = THIS
                ),
                expected = LoweringResult(
                    statements = listOf(
                        HighIrStatement.LetDeclaration(name = "_LOWERING_0", typeAnnotation = unit),
                        HighIrStatement.IfElse(
                            booleanExpression = IR_THIS,
                            s1 = listOf(
                                HighIrStatement.ConstantDefinition(
                                    pattern = HighIrPattern.WildCardPattern,
                                    typeAnnotation = unit,
                                    assignedExpression = IR_THIS
                                ),
                                HighIrStatement.VariableAssignment(
                                    name = "_LOWERING_0",
                                    assignedExpression = HighIrExpression.UNIT
                                )
                            ),
                            s2 = listOf(
                                HighIrStatement.VariableAssignment(name = "_LOWERING_0", assignedExpression = IR_THIS)
                            )
                        )
                    ),
                    expression = HighIrExpression.Variable(type = unit, name = "_LOWERING_0")
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
                        s2 = listOf(
                            HighIrStatement.ConstantDefinition(
                                pattern = HighIrPattern.WildCardPattern,
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
                        HighIrStatement.LetDeclaration(name = "_LOWERING_0", typeAnnotation = unit),
                        HighIrStatement.IfElse(
                            booleanExpression = IR_THIS,
                            s1 = listOf(HighIrStatement.Throw(expression = IR_THIS)),
                            s2 = listOf(
                                HighIrStatement.VariableAssignment(name = "_LOWERING_0", assignedExpression = IR_THIS)
                            )
                        )
                    ),
                    expression = HighIrExpression.Variable(type = unit, name = "_LOWERING_0")
                )
            )
        }

        "Match lowering works." {
            assertCorrectlyLowered(
                expression = Expression.Match(
                    range = dummyRange,
                    type = DUMMY_IDENTIFIER_TYPE,
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
                        HighIrStatement.ConstantDefinition(
                            pattern = HighIrPattern.VariablePattern(name = "_LOWERING_0"),
                            typeAnnotation = DUMMY_IDENTIFIER_TYPE,
                            assignedExpression = IR_THIS
                        ),
                        HighIrStatement.Match(
                            type = DUMMY_IDENTIFIER_TYPE,
                            assignedTemporaryVariable = "_LOWERING_1",
                            variableForMatchedExpression = "_LOWERING_0",
                            variableForMatchedExpressionType = DUMMY_IDENTIFIER_TYPE,
                            matchingList = listOf(
                                HighIrStatement.Match.VariantPatternToStatement(
                                    tag = "Foo",
                                    dataVariable = "bar",
                                    statements = emptyList(),
                                    finalExpression = IR_THIS
                                ),
                                HighIrStatement.Match.VariantPatternToStatement(
                                    tag = "Bar",
                                    dataVariable = null,
                                    statements = emptyList(),
                                    finalExpression = IR_THIS
                                )
                            )
                        )
                    ),
                    expression = HighIrExpression.Variable(type = DUMMY_IDENTIFIER_TYPE, name = "_LOWERING_1")
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
                        HighIrStatement.ConstantDefinition(
                            pattern = HighIrPattern.VariablePattern(name = "_LOWERING_0"),
                            typeAnnotation = DUMMY_IDENTIFIER_TYPE,
                            assignedExpression = IR_THIS
                        ),
                        HighIrStatement.Match(
                            type = int,
                            assignedTemporaryVariable = "_LOWERING_1",
                            variableForMatchedExpression = "_LOWERING_0",
                            variableForMatchedExpressionType = DUMMY_IDENTIFIER_TYPE,
                            matchingList = listOf(
                                HighIrStatement.Match.VariantPatternToStatement(
                                    tag = "Foo",
                                    dataVariable = "bar",
                                    statements = emptyList(),
                                    finalExpression = IR_THIS
                                ),
                                HighIrStatement.Match.VariantPatternToStatement(
                                    tag = "Bar",
                                    dataVariable = null,
                                    statements = emptyList(),
                                    finalExpression = IR_THIS
                                )
                            )
                        )
                    ),
                    expression = HighIrExpression.Variable(type = int, name = "_LOWERING_1")
                )
            )
        }

        "Inner Scope does not pollute outer one" {
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
                        HighIrStatement.Block(
                            statements = listOf(
                                HighIrStatement.LetDeclaration(name = "_LOWERING_0", typeAnnotation = unit),
                                HighIrStatement.Block(
                                    statements = listOf(
                                        HighIrStatement.ConstantDefinition(
                                            pattern = HighIrPattern.VariablePattern(name = "a"),
                                            typeAnnotation = unit,
                                            assignedExpression = IR_THIS
                                        ),
                                        HighIrStatement.VariableAssignment(
                                            name = "_LOWERING_0",
                                            assignedExpression = HighIrExpression.Variable(
                                                type = unit, name = "a"
                                            )
                                        )
                                    )
                                ),
                                HighIrStatement.ConstantDefinition(
                                    pattern = HighIrPattern.VariablePattern(name = "a"),
                                    typeAnnotation = unit,
                                    assignedExpression = HighIrExpression.Variable(
                                        type = unit, name = "_LOWERING_0"
                                    )
                                )
                            )
                        )
                    ),
                    expression = HighIrExpression.UNIT
                )
            )
        }
    }

    companion object {
        private val DUMMY_IDENTIFIER_TYPE: Type.IdentifierType = id(identifier = "Dummy")
        private val THIS: Expression = Expression.This(range = dummyRange, type = DUMMY_IDENTIFIER_TYPE)
        private val IR_THIS: HighIrExpression = HighIrExpression.This(type = DUMMY_IDENTIFIER_TYPE)
    }
}
