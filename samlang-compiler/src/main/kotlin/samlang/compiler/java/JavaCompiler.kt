package samlang.compiler.java

import samlang.ast.common.Sources
import samlang.ast.common.Type
import samlang.ast.ir.IrExpression
import samlang.ast.ir.IrExpression.Companion.UNIT
import samlang.ast.ir.IrExpression.Never
import samlang.ast.ir.IrPattern
import samlang.ast.ir.IrStatement
import samlang.ast.java.JavaMethod
import samlang.ast.java.JavaOuterClass
import samlang.ast.java.JavaStaticInnerClass
import samlang.ast.lang.ClassDefinition
import samlang.ast.lang.Module
import samlang.compiler.ir.lowerExpression

fun compileToJavaSources(sources: Sources<Module>): Sources<JavaOuterClass> =
    Sources(moduleMappings = sources.moduleMappings.mapValues { (_, module) -> compileJavaOuterClass(module = module) })

private fun compileJavaOuterClass(module: Module): JavaOuterClass =
    JavaOuterClass(
        imports = module.imports,
        innerStaticClasses = module.classDefinitions.map(transform = ::compileJavaInnerStaticClass)
    )

private fun compileJavaInnerStaticClass(classDefinition: ClassDefinition): JavaStaticInnerClass =
    JavaStaticInnerClass(
        className = classDefinition.name,
        typeDefinition = classDefinition.typeDefinition,
        methods = classDefinition.members.map(transform = ::compileJavaMethod)
    )

internal fun compileJavaMethod(classMember: ClassDefinition.MemberDefinition): JavaMethod {
    val bodyLoweringResult = lowerExpression(expression = classMember.body)
    val body = if (bodyLoweringResult.expression == UNIT || bodyLoweringResult.expression == Never) {
        bodyLoweringResult.statements
    } else {
        val additionStatementForFinalExpression =
            if (classMember.body.type == Type.unit &&
                bodyLoweringResult.expression is IrExpression.FunctionApplication) {
                IrStatement.ConstantDefinition(
                    pattern = IrPattern.WildCardPattern,
                    typeAnnotation = Type.unit,
                    assignedExpression = bodyLoweringResult.expression
                )
            } else {
                IrStatement.Return(expression = bodyLoweringResult.expression)
            }
        bodyLoweringResult.statements.plus(element = additionStatementForFinalExpression)
    }
    return JavaMethod(
        isPublic = classMember.isPublic,
        isStatic = !classMember.isMethod,
        name = classMember.name,
        typeParameters = classMember.typeParameters,
        parameters = classMember.parameters.map { it.name to it.type },
        returnType = classMember.type.returnType,
        body = body
    )
}
