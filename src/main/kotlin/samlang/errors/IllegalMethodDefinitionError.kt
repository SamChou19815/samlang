package samlang.errors

import samlang.ast.Range

class IllegalMethodDefinitionError(name: String, range: Range) : CompileTimeError.WithRange(
    reason = "It is illegal to define methods inside util module $name.",
    range = range
)
