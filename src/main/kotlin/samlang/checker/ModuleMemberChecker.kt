package samlang.checker

import samlang.ast.Module.MemberDefinition

internal fun MemberDefinition.typeCheck(
    errorCollector: ErrorCollector,
    typeCheckingContext: TypeCheckingContext
): MemberDefinition {
    var contextForTypeCheckingBody = if (isMethod) typeCheckingContext.addThisType() else typeCheckingContext
    if (typeParameters != null) {
        contextForTypeCheckingBody =
            contextForTypeCheckingBody.addLocalGenericTypes(genericTypes = typeParameters)
    }
    contextForTypeCheckingBody = parameters.fold(initial = contextForTypeCheckingBody) { tempContext, parameter ->
        val parameterType = parameter.type.validate(context = tempContext, errorRange = parameter.typeRange)
        tempContext.addLocalValueType(name = parameter.name, type = parameterType, errorRange = parameter.nameRange)
    }
    val checkedBody = body.typeCheck(
        errorCollector = errorCollector,
        typeCheckingContext = contextForTypeCheckingBody,
        expectedType = type.returnType
    )
    return this.copy(body = checkedBody)
}
