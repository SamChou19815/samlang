package samlang.errors

import samlang.ast.TypeExpression
import samlang.ast.Range

class UnexpectedTypeError(
    expected: TypeExpression,
    actual: TypeExpression,
    range: Range
) : CompileTimeError.WithPosition(
    reason = "Expect: ${expected.prettyPrint()}.\nActual: ${actual.prettyPrint()}.",
    range = range
)
