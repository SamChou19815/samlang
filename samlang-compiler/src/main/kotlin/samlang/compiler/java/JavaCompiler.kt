package samlang.compiler.java

import samlang.ast.common.Sources
import samlang.ast.common.Type
import samlang.ast.hir.HighIrClassDefinition
import samlang.ast.hir.HighIrExpression
import samlang.ast.hir.HighIrFunction
import samlang.ast.hir.HighIrPattern
import samlang.ast.hir.HighIrStatement
import samlang.ast.java.JavaOuterClass
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

private fun compileJavaInnerStaticClass(classDefinition: ClassDefinition): HighIrClassDefinition =
    HighIrClassDefinition(
        className = classDefinition.name,
        typeDefinition = classDefinition.typeDefinition,
        members = classDefinition.members.map(transform = ::compileJavaMethod)
    )

internal fun compileJavaMethod(classMember: ClassDefinition.MemberDefinition): HighIrFunction {
    val bodyLoweringResult = lowerExpression(expression = classMember.body)
    val statements = bodyLoweringResult.unwrappedStatements
    val finalExpression = bodyLoweringResult.expression
    val body = if (finalExpression == null) {
        statements
    } else {
        val additionStatementForFinalExpression =
            if (classMember.body.type == Type.unit &&
                bodyLoweringResult.expression is HighIrExpression.FunctionApplication) {
                HighIrStatement.ConstantDefinition(
                    pattern = HighIrPattern.WildCardPattern,
                    typeAnnotation = Type.unit,
                    assignedExpression = bodyLoweringResult.expression
                )
            } else {
                HighIrStatement.Return(expression = bodyLoweringResult.expression)
            }
        statements.plus(element = additionStatementForFinalExpression)
    }
    return HighIrFunction(
        isPublic = classMember.isPublic,
        isMethod = classMember.isMethod,
        name = classMember.name,
        typeParameters = classMember.typeParameters,
        parameters = classMember.parameters.map { it.name to it.type },
        returnType = classMember.type.returnType,
        body = body
    )
}
