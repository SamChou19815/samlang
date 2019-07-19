package samlang.errors

import samlang.ast.ClassDefinition
import samlang.ast.Range

class UnsupportedClassTypeDefinitionError(
    typeDefinitionType: ClassDefinition.TypeDefinitionType,
    range: Range
) : CompileTimeError.WithRange(
    reason = "Expect the current class to have `${typeDefinitionType.displayName}` type definition, but it doesn't.",
    range = range
)
