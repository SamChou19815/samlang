package samlang.compiler.java

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.common.Range
import samlang.ast.common.Range.Companion.DUMMY as dummyRange
import samlang.ast.common.Type
import samlang.ast.ir.IrExpression
import samlang.ast.ir.IrStatement
import samlang.ast.java.JavaMethod
import samlang.ast.lang.ClassDefinition.MemberDefinition
import samlang.ast.lang.Expression

class JavaMemberCompilerTest : StringSpec() {

    private fun assertCorrectlyCompiled(classMember: MemberDefinition, javaMethod: JavaMethod) {
        compileJavaMethod(classMember = classMember) shouldBe javaMethod
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
                javaMethod = JavaMethod(
                    isPublic = true,
                    isStatic = true,
                    name = "foo",
                    typeParameters = emptyList(),
                    parameters = emptyList(),
                    returnType = Type.unit,
                    body = listOf(IrStatement.Return(expression = IR_THIS))
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
                javaMethod = JavaMethod(
                    isPublic = false,
                    isStatic = true,
                    name = "bar",
                    typeParameters = emptyList(),
                    parameters = emptyList(),
                    returnType = Type.unit,
                    body = listOf(IrStatement.Return(expression = IR_THIS))
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
                    body = Expression.Literal.ofUnit(range = dummyRange)
                ),
                javaMethod = JavaMethod(
                    isPublic = false,
                    isStatic = true,
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
        private val IR_THIS: IrExpression = IrExpression.This(type = Type.unit)
    }
}
