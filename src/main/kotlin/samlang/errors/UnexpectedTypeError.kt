package samlang.errors

import samlang.ast.checked.CheckedTypeExpr
import samlang.ast.common.Range

class UnexpectedTypeError(
    expected: CheckedTypeExpr,
    actual: CheckedTypeExpr,
    range: Range
) : CompileTimeError.WithPosition(
    reason = "Expect: ${expected.prettyPrint()}.\nActual: ${actual.prettyPrint()}.",
    range = range
)
