package samlang.compiler.ir

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.common.Range
import samlang.ast.common.Range.Companion.DUMMY as dummyRange
import samlang.ast.common.Type
import samlang.ast.hir.HighIrExpression
import samlang.ast.hir.HighIrFunction
import samlang.ast.hir.HighIrStatement
import samlang.ast.lang.ClassDefinition.MemberDefinition
import samlang.ast.lang.Expression
import samlang.ast.lang.StatementBlock

class ClassMemberCompilerTest : StringSpec() {
    private fun assertCorrectlyCompiled(classMember: MemberDefinition, javaMethod: HighIrFunction) {
        compileFunction(classMember = classMember) shouldBe javaMethod
    }

    init {
        "Simple functions are correctly compiled." {
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
                javaMethod = HighIrFunction(
                    isPublic = true,
                    isMethod = false,
                    name = "foo",
                    typeParameters = emptyList(),
                    parameters = emptyList(),
                    returnType = Type.unit,
                    body = listOf(HighIrStatement.Return(expression = IR_THIS))
                )
            )
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
                javaMethod = HighIrFunction(
                    isPublic = false,
                    isMethod = false,
                    name = "bar",
                    typeParameters = emptyList(),
                    parameters = emptyList(),
                    returnType = Type.unit,
                    body = listOf(HighIrStatement.Return(expression = IR_THIS))
                )
            )
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
                javaMethod = HighIrFunction(
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
    }

    companion object {
        private val THIS: Expression = Expression.This(range = dummyRange, type = Type.unit)
        private val IR_THIS: HighIrExpression = HighIrExpression.This(type = Type.unit)
    }
}
