package samlang.checker

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import samlang.ast.common.Range
import samlang.ast.common.Type
import samlang.ast.lang.Expression

class ExpressionTypeFixerTest {
    @Test
    fun literalsTypesAreUnchanged() {
        assertThrows(unfixed = Expression.Literal.ofTrue(range = Range.DUMMY), type = Type.int)
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

    @Test
    fun thisExpressionsTypesAreCorrectlyResolved() {
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

    @Test
    fun variablesTypesAreCorrectlyResolved() {
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

    @Test
    fun deepExpressionsTypesAreCorrectlyResolved() {
        val expected = Expression.IfElse(
            range = Range.DUMMY,
            type = Type.bool,
            boolExpression = Expression.Literal.ofTrue(range = Range.DUMMY),
            e1 = Expression.Literal.ofTrue(range = Range.DUMMY),
            e2 = Expression.FunctionApplication(
                range = Range.DUMMY,
                type = Type.bool,
                functionExpression = Expression.Lambda(
                    range = Range.DUMMY,
                    type = Type.FunctionType(argumentTypes = listOf(Type.int), returnType = Type.bool),
                    parameters = listOf("a" to Type.int),
                    captured = emptyMap(),
                    body = Expression.Literal.ofTrue(range = Range.DUMMY)
                ),
                arguments = listOf(
                    Expression.Variable(range = Range.DUMMY, type = Type.int, name = "v")
                )
            )
        )
        val unfixed = Expression.IfElse(
            range = Range.DUMMY,
            type = Type.UndecidedType(index = 1),
            boolExpression = Expression.Literal.ofTrue(range = Range.DUMMY),
            e1 = Expression.Literal.ofTrue(range = Range.DUMMY),
            e2 = Expression.FunctionApplication(
                range = Range.DUMMY,
                type = Type.UndecidedType(index = 5),
                functionExpression = Expression.Lambda(
                    range = Range.DUMMY,
                    type = Type.FunctionType(
                        argumentTypes = listOf(Type.int),
                        returnType = Type.UndecidedType(index = 9)
                    ),
                    parameters = listOf("a" to Type.int),
                    captured = emptyMap(),
                    body = Expression.Literal.ofTrue(range = Range.DUMMY)
                ),
                arguments = listOf(
                    Expression.Variable(range = Range.DUMMY, type = Type.UndecidedType(index = 2), name = "v")
                )
            )
        )
        assertCorrectlyFixed(expected = expected, unfixed = unfixed, type = Type.bool)
        assertThrows(unfixed = unfixed, type = Type.int)
    }

    private fun assertCorrectlyFixed(expected: Expression, unfixed: Expression, type: Type) {
        assertEquals(
            expected = expected,
            actual = fixExpressionType(expression = unfixed, expectedType = type, resolution = TestingResolution)
        )
    }

    private fun assertThrows(unfixed: Expression, type: Type) {
        assertFailsWith<IllegalStateException> {
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
