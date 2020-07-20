package samlang.compiler.hir

import samlang.ast.common.IrNameEncoder
import samlang.ast.common.ModuleReference
import samlang.ast.common.Sources
import samlang.ast.common.Type
import samlang.ast.hir.HighIrFunction
import samlang.ast.hir.HighIrModule
import samlang.ast.hir.HighIrStatement
import samlang.ast.lang.ClassDefinition
import samlang.ast.lang.Module

fun compileSources(sources: Sources<Module>): Sources<HighIrModule> =
    Sources(moduleMappings = sources.moduleMappings.mapValues { (moduleReference, module) ->
        compileModule(
            moduleReference = moduleReference,
            module = module
        )
    })

fun compileModule(moduleReference: ModuleReference, module: Module): HighIrModule =
    HighIrModule(
        functions = module.classDefinitions.map { classDefinition ->
            classDefinition.members.map {
                compileFunction(
                    moduleReference = moduleReference,
                    module = module,
                    className = classDefinition.name,
                    classMember = it
                )
            }.flatten()
        }.flatten()
    )

/** Exposed for testing. */
private fun compileFunction(
    moduleReference: ModuleReference,
    module: Module,
    className: String,
    classMember: ClassDefinition.MemberDefinition
): List<HighIrFunction> {
    val functionName = IrNameEncoder.encodeFunctionName(moduleReference, className, classMember.name)
    val bodyLoweringResult = lowerExpression(
        moduleReference = moduleReference,
        module = module,
        encodedFunctionName = functionName,
        expression = classMember.body
    )
    val parameters = classMember.parameters.map { it.name }
    val statements = bodyLoweringResult.statements
    val body = if (classMember.body.type == Type.unit) {
        statements
    } else {
        statements.plus(element = HighIrStatement.Return(expression = bodyLoweringResult.expression))
    }
    val functions = bodyLoweringResult.syntheticFunctions
    val userDefinedFunction = HighIrFunction(
        name = functionName,
        parameters = if (classMember.isMethod) listOf("this", *parameters.toTypedArray()) else parameters,
        hasReturn = classMember.type.returnType != Type.unit,
        body = body
    )
    return functions + userDefinedFunction
}
