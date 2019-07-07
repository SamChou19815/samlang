package samlang.errors

import samlang.ast.Type
import samlang.ast.Range

class UnexpectedTypeError(
    expected: Type,
    actual: Type,
    range: Range
) : CompileTimeError.WithPosition(
    reason = "Expect: ${expected.prettyPrint()}.\nActual: ${actual.prettyPrint()}.",
    range = range
)
