package samlang.errors

import samlang.ast.common.Range
import samlang.ast.common.Type

class UnexpectedTypeError(
    expected: Type,
    actual: Type,
    range: Range
) : CompileTimeError.WithRange(
    errorType = "UnexpectedType",
    reason = "Expected: `${expected.prettyPrint()}`, actual: `${actual.prettyPrint()}`.",
    range = range
)
