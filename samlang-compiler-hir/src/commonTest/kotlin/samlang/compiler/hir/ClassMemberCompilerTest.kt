package samlang.compiler.hir

import kotlin.test.Test
import kotlin.test.assertEquals
import samlang.ast.common.Range
import samlang.ast.common.Range.Companion.DUMMY as dummyRange
import samlang.ast.common.Type
import samlang.ast.hir.HighIrExpression
import samlang.ast.hir.HighIrFunction
import samlang.ast.hir.HighIrStatement
import samlang.ast.lang.ClassDefinition.MemberDefinition
import samlang.ast.lang.Expression
import samlang.ast.lang.StatementBlock

class ClassMemberCompilerTest {
    private fun assertCorrectlyCompiled(classMember: MemberDefinition, highIrFunction: HighIrFunction) {
        assertEquals(expected = highIrFunction, actual = compileFunction(classMember = classMember))
    }

    @Test
    fun simpleFunctionsAreCorrectlyCompiledTest1() {
        assertCorrectlyCompiled(
            classMember = MemberDefinition(
                range = Range.DUMMY,
                isPublic = true,
                isMethod = false,
                nameRange = Range.DUMMY,
                name = "foo",
                typeParameters = emptyList(),
                type = Type.FunctionType(argumentTypes = emptyList(), returnType = Type.unit),
                parameters = emptyList(),
                body = THIS
            ),
            highIrFunction = HighIrFunction(
                isPublic = true,
                isMethod = false,
                name = "foo",
                typeParameters = emptyList(),
                parameters = emptyList(),
                returnType = Type.unit,
                body = listOf(HighIrStatement.Return(expression = IR_THIS))
            )
        )
    }

    @Test
    fun simpleFunctionsAreCorrectlyCompiledTest2() {
        assertCorrectlyCompiled(
            classMember = MemberDefinition(
                range = Range.DUMMY,
                isPublic = false,
                isMethod = false,
                nameRange = Range.DUMMY,
                name = "bar",
                typeParameters = emptyList(),
                type = Type.FunctionType(argumentTypes = emptyList(), returnType = Type.unit),
                parameters = emptyList(),
                body = THIS
            ),
            highIrFunction = HighIrFunction(
                isPublic = false,
                isMethod = false,
                name = "bar",
                typeParameters = emptyList(),
                parameters = emptyList(),
                returnType = Type.unit,
                body = listOf(HighIrStatement.Return(expression = IR_THIS))
            )
        )
    }

    @Test
    fun simpleFunctionsAreCorrectlyCompiledTest3() {
        assertCorrectlyCompiled(
            classMember = MemberDefinition(
                range = Range.DUMMY,
                isPublic = false,
                isMethod = false,
                nameRange = Range.DUMMY,
                name = "bar",
                typeParameters = emptyList(),
                type = Type.FunctionType(argumentTypes = emptyList(), returnType = Type.unit),
                parameters = emptyList(),
                body = Expression.StatementBlockExpression(
                    range = Range.DUMMY,
                    type = Type.unit,
                    block = StatementBlock(range = Range.DUMMY, statements = emptyList(), expression = null)
                )
            ),
            highIrFunction = HighIrFunction(
                isPublic = false,
                isMethod = false,
                name = "bar",
                typeParameters = emptyList(),
                parameters = emptyList(),
                returnType = Type.unit,
                body = listOf()
            )
        )
    }

    companion object {
        private val THIS: Expression = Expression.This(range = dummyRange, type = Type.unit)
        private val IR_THIS: HighIrExpression = HighIrExpression.Variable(name = "this")
    }
}
