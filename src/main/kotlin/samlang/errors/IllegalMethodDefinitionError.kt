package samlang.errors

import samlang.ast.Range

class IllegalMethodDefinitionError(moduleName: String, range: Range) : CompileTimeError.WithRange(
    reason = "It is illegal to define methods inside util module `$moduleName`.",
    range = range
)
