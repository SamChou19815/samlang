package samlang.errors

import samlang.ast.common.Range
import samlang.ast.common.TypeDefinitionType

class UnsupportedClassTypeDefinitionError(
    typeDefinitionType: TypeDefinitionType,
    range: Range
) : CompileTimeError.WithRange(
    reason = "Expect the current class to have `${typeDefinitionType.displayName}` type definition, but it doesn't.",
    range = range
)
