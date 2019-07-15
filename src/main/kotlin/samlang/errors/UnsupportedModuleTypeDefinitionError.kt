package samlang.errors

import samlang.ast.Module
import samlang.ast.Range

class UnsupportedModuleTypeDefinitionError(
    typeDefinitionType: Module.TypeDefinitionType,
    range: Range
) : CompileTimeError.WithRange(
    reason = "Expect the current module to have `${typeDefinitionType.displayName}` type definition, but it doesn't.",
    range = range
)
