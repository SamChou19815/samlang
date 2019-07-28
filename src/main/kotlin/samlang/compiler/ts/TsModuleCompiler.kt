package samlang.compiler.ts

import samlang.ast.common.Type
import samlang.ast.common.TypeDefinition
import samlang.ast.ir.IrStatement
import samlang.ast.lang.ClassDefinition
import samlang.ast.lang.Module
import samlang.ast.ts.TsFunction
import samlang.ast.ts.TsModule
import samlang.compiler.ir.TS_UNIT
import samlang.compiler.ir.lowerExpression

internal fun compileTsModule(module: Module): TsModule {
    val typeDefinitions = arrayListOf<TypeDefinition>()
    val functions = arrayListOf<TsFunction>()
    for (classDefinition in module.classDefinitions) {
        typeDefinitions.add(element = classDefinition.typeDefinition)
        for (member in classDefinition.members) {
            functions.add(element = compileTsFunction(classDefinition = classDefinition, classMember = member))
        }
    }
    return TsModule(imports = module.imports, typeDefinitions = typeDefinitions, functions = functions)
}

private fun compileTsFunction(
    classDefinition: ClassDefinition,
    classMember: ClassDefinition.MemberDefinition
): TsFunction {
    val mangledName = "${classDefinition.name}$${classMember.name}"
    val bodyLoweringResult = lowerExpression(expression = classMember.body)
    val body = if (bodyLoweringResult.expression == TS_UNIT) {
        bodyLoweringResult.statements
    } else {
        bodyLoweringResult.statements.plus(element = IrStatement.Return(expression = bodyLoweringResult.expression))
    }
    val classTypeParameters = classDefinition.typeDefinition.typeParameters
    val thisType = Type.IdentifierType(
        identifier = classDefinition.name,
        typeArguments = classTypeParameters?.map { Type.IdentifierType(identifier = it, typeArguments = null) }
    )
    val functionTypeParameters = classMember.typeParameters
    val typeParameters = if (classMember.isMethod) {
        when {
            classTypeParameters == null && functionTypeParameters == null -> null
            classTypeParameters == null && functionTypeParameters != null -> functionTypeParameters
            classTypeParameters != null && functionTypeParameters == null -> classTypeParameters
            classTypeParameters != null && functionTypeParameters != null ->
                classTypeParameters.plus(elements = functionTypeParameters)
            else -> error(message = "It should already be exhaustive!")
        }
    } else {
        functionTypeParameters
    }
    val parameters = if (classMember.isMethod) {
        val parametersList = arrayListOf<Pair<String, Type>>("_this" to thisType)
        parametersList.addAll(elements = classMember.parameters.map { it.name to it.type })
        parametersList
    } else {
        classMember.parameters.map { it.name to it.type }
    }
    return TsFunction(
        shouldBeExported = classMember.isPublic,
        name = mangledName,
        typeParameters = typeParameters,
        parameters = parameters,
        returnType = classMember.type.returnType,
        body = body
    )
}
