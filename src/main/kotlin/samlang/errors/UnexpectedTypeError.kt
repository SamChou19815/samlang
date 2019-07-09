package samlang.errors

import samlang.ast.Type
import samlang.ast.Range

class UnexpectedTypeError(
    expected: Type,
    actual: Type,
    range: Range
) : CompileTimeError.WithRange(
    reason = "Expected: `${expected.prettyPrint()}`, actual: `${actual.prettyPrint()}`.",
    range = range
)
