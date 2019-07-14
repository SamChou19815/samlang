package samlang.errors

import samlang.ast.Range
import samlang.ast.Type

class UnexpectedTypeError(
    expected: Type,
    actual: Type,
    range: Range
) : CompileTimeError.WithRange(
    reason = "Expected: `${expected.prettyPrint()}`, actual: `${actual.prettyPrint()}`.",
    range = range
)
