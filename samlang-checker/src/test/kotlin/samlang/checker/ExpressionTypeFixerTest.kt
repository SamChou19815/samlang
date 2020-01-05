package samlang.checker

import io.kotlintest.shouldBe
import io.kotlintest.shouldThrow
import io.kotlintest.specs.StringSpec
import samlang.ast.common.Range
import samlang.ast.common.Type
import samlang.ast.lang.Expression

class ExpressionTypeFixerTest : StringSpec() {
    init {
        "Literals' types are unchanged" {
            assertCorrectlyFixed(
                expected = Expression.Literal.ofUnit(range = Range.DUMMY),
                unfixed = Expression.Literal.ofUnit(range = Range.DUMMY),
                type = Type.unit
            )
            assertThrows(unfixed = Expression.Literal.ofUnit(range = Range.DUMMY), type = Type.int)
            assertCorrectlyFixed(
                expected = Expression.Literal.ofInt(range = Range.DUMMY, value = 1),
                unfixed = Expression.Literal.ofInt(range = Range.DUMMY, value = 1),
                type = Type.int
            )
            assertThrows(unfixed = Expression.Literal.ofInt(range = Range.DUMMY, value = 1), type = Type.unit)
            assertCorrectlyFixed(
                expected = Expression.Literal.ofTrue(range = Range.DUMMY),
                unfixed = Expression.Literal.ofTrue(range = Range.DUMMY),
                type = Type.bool
            )
            assertThrows(unfixed = Expression.Literal.ofTrue(range = Range.DUMMY), type = Type.unit)
            assertCorrectlyFixed(
                expected = Expression.Literal.ofString(range = Range.DUMMY, value = "foo"),
                unfixed = Expression.Literal.ofString(range = Range.DUMMY, value = "foo"),
                type = Type.string
            )
            assertThrows(unfixed = Expression.Literal.ofString(range = Range.DUMMY, value = "foo"), type = Type.unit)
        }
        "This expressions' types are correctly resolved." {
            assertCorrectlyFixed(
                expected = Expression.This(range = Range.DUMMY, type = Type.unit),
                unfixed = Expression.This(range = Range.DUMMY, type = Type.UndecidedType(index = 0)),
                type = Type.unit
            )
            assertThrows(
                unfixed = Expression.This(range = Range.DUMMY, type = Type.UndecidedType(index = 0)),
                type = Type.bool
            )
        }
        "Variables' types are correctly resolved." {
            assertCorrectlyFixed(
                expected = Expression.Variable(range = Range.DUMMY, type = Type.unit, name = "v"),
                unfixed = Expression.Variable(range = Range.DUMMY, type = Type.UndecidedType(index = 0), name = "v"),
                type = Type.unit
            )
            assertThrows(
                unfixed = Expression.Variable(range = Range.DUMMY, type = Type.UndecidedType(index = 0), name = "v"),
                type = Type.bool
            )
        }
        "Deep expression's type is correctly resolved" {
            val expected = Expression.IfElse(
                range = Range.DUMMY,
                type = Type.unit,
                boolExpression = Expression.Literal.ofTrue(range = Range.DUMMY),
                e1 = Expression.Literal.ofUnit(range = Range.DUMMY),
                e2 = Expression.FunctionApplication(
                    range = Range.DUMMY,
                    type = Type.unit,
                    functionExpression = Expression.Lambda(
                        range = Range.DUMMY,
                        type = Type.FunctionType(argumentTypes = listOf(Type.int), returnType = Type.unit),
                        parameters = listOf("a" to Type.int),
                        body = Expression.Literal.ofUnit(range = Range.DUMMY)
                    ),
                    arguments = listOf(
                        Expression.Variable(range = Range.DUMMY, type = Type.int, name = "v")
                    )
                )
            )
            val unfixed = Expression.IfElse(
                range = Range.DUMMY,
                type = Type.UndecidedType(index = 0),
                boolExpression = Expression.Literal.ofTrue(range = Range.DUMMY),
                e1 = Expression.Literal.ofUnit(range = Range.DUMMY),
                e2 = Expression.FunctionApplication(
                    range = Range.DUMMY,
                    type = Type.UndecidedType(index = 4),
                    functionExpression = Expression.Lambda(
                        range = Range.DUMMY,
                        type = Type.FunctionType(
                            argumentTypes = listOf(Type.int),
                            returnType = Type.UndecidedType(index = 8)
                        ),
                        parameters = listOf("a" to Type.int),
                        body = Expression.Literal.ofUnit(range = Range.DUMMY)
                    ),
                    arguments = listOf(
                        Expression.Variable(range = Range.DUMMY, type = Type.UndecidedType(index = 2), name = "v")
                    )
                )
            )
            assertCorrectlyFixed(expected = expected, unfixed = unfixed, type = Type.unit)
            assertThrows(unfixed = unfixed, type = Type.int)
        }
    }

    private fun assertCorrectlyFixed(expected: Expression, unfixed: Expression, type: Type) {
        fixExpressionType(expression = unfixed, expectedType = type, resolution = TestingResolution) shouldBe expected
    }

    private fun assertThrows(unfixed: Expression, type: Type) {
        shouldThrow<IllegalStateException> {
            fixExpressionType(expression = unfixed, expectedType = type, resolution = TestingResolution)
        }
    }

    object TestingResolution : ReadOnlyTypeResolution {
        override fun getPartiallyResolvedType(undecidedType: Type.UndecidedType): Type =
            error(message = "Not necessary for this test.")

        override fun resolveType(unresolvedType: Type): Type =
            TypeResolver.resolveType(type = unresolvedType, function = TypeResolverTest.resolver)
    }
}
