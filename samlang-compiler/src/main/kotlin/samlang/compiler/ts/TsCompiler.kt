package samlang.compiler.ts

import samlang.ast.common.ModuleMembersImport
import samlang.ast.common.ModuleReference
import samlang.ast.common.Range
import samlang.ast.common.Sources
import samlang.ast.common.Type
import samlang.ast.common.TypeDefinition
import samlang.ast.hir.HighIrStatement
import samlang.ast.lang.ClassDefinition
import samlang.ast.lang.Module
import samlang.ast.ts.TsFunction
import samlang.ast.ts.TsModule
import samlang.ast.ts.TsModuleFolder
import samlang.compiler.hir.lowerExpression

fun compileToTsSources(sources: Sources<Module>): Sources<TsModuleFolder> =
    Sources(moduleMappings = sources.moduleMappings.mapValues { (_, module) -> compileTsModule(module = module) })

private fun compileTsModule(module: Module): TsModuleFolder {
    val (imports, classes) = module
    val allImports = ArrayList(imports)
    allImports.add(
        element = ModuleMembersImport(
            range = Range.DUMMY,
            importedMembers = classes.map { it.name to Range.DUMMY },
            importedModule = ModuleReference.ROOT,
            importedModuleRange = Range.DUMMY
        )
    )
    return TsModuleFolder(
        subModules = classes.map { compileClassToTsModule(imports = allImports, classDefinition = it) }
    )
}

internal fun compileClassToTsModule(imports: List<ModuleMembersImport>, classDefinition: ClassDefinition): TsModule {
    val typeDefinitions = arrayListOf<Pair<String, TypeDefinition>>()
    val functions = arrayListOf<TsFunction>()
    typeDefinitions.add(element = classDefinition.name to classDefinition.typeDefinition)
    for (member in classDefinition.members) {
        functions.add(element = compileTsFunction(classDefinition = classDefinition, classMember = member))
    }
    return TsModule(
        imports = imports,
        typeName = classDefinition.name,
        typeDefinition = classDefinition.typeDefinition,
        functions = functions
    )
}

private fun compileTsFunction(
    classDefinition: ClassDefinition,
    classMember: ClassDefinition.MemberDefinition
): TsFunction {
    val bodyLoweringResult = lowerExpression(expression = classMember.body)
    val finalExpression = bodyLoweringResult.expression
    val body = if (finalExpression == null) {
        bodyLoweringResult.unwrappedStatements
    } else {
        bodyLoweringResult.unwrappedStatements.plus(element = HighIrStatement.Return(expression = finalExpression))
    }
    val classTypeParameters = classDefinition.typeDefinition.typeParameters
    val thisType = Type.IdentifierType(
        identifier = classDefinition.name,
        typeArguments = classTypeParameters.map { Type.id(identifier = it) }
    )
    val functionTypeParameters = classMember.typeParameters
    val typeParameters = if (classMember.isMethod) {
        classTypeParameters.plus(elements = functionTypeParameters)
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
        name = classMember.name,
        typeParameters = typeParameters,
        parameters = parameters,
        returnType = classMember.type.returnType,
        body = body
    )
}
