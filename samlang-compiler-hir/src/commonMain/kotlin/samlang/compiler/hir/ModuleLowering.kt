package samlang.compiler.hir

import samlang.ast.common.Sources
import samlang.ast.common.Type
import samlang.ast.hir.HighIrClassDefinition
import samlang.ast.hir.HighIrExpression
import samlang.ast.hir.HighIrFunction
import samlang.ast.hir.HighIrModule
import samlang.ast.hir.HighIrStatement
import samlang.ast.lang.ClassDefinition
import samlang.ast.lang.Module

fun compileSources(sources: Sources<Module>): Sources<HighIrModule> =
    Sources(moduleMappings = sources.moduleMappings.mapValues { (_, module) -> compileModule(module = module) })

fun compileModule(module: Module): HighIrModule =
    HighIrModule(imports = module.imports, classDefinitions = module.classDefinitions.map(::compileClassDefinition))

private fun compileClassDefinition(classDefinition: ClassDefinition): HighIrClassDefinition =
    HighIrClassDefinition(
        className = classDefinition.name,
        members = classDefinition.members.map(transform = ::compileFunction)
    )

/** Exposed for testing. */
internal fun compileFunction(classMember: ClassDefinition.MemberDefinition): HighIrFunction {
    val bodyLoweringResult = lowerExpression(expression = classMember.body)
    val statements = bodyLoweringResult.statements
    val body = if (classMember.body.type == Type.unit) {
        statements
    } else {
        val additionStatementForFinalExpression =
            if (classMember.body.type == Type.unit &&
                bodyLoweringResult.expression is HighIrExpression.FunctionApplication) {
                HighIrStatement.ExpressionAsStatement(expressionWithPotentialSideEffect = bodyLoweringResult.expression)
            } else {
                HighIrStatement.Return(expression = bodyLoweringResult.expression)
            }
        statements.plus(element = additionStatementForFinalExpression)
    }
    return HighIrFunction(
        isPublic = classMember.isPublic,
        isMethod = classMember.isMethod,
        name = classMember.name,
        parameters = classMember.parameters.map { it.name },
        hasReturn = classMember.type.returnType != Type.unit,
        body = body
    )
}
