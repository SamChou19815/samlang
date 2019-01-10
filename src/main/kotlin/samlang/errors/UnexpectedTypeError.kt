package samlang.errors

import samlang.ast.checked.CheckedTypeExpr
import samlang.parser.Position

class UnexpectedTypeError(
    expected: CheckedTypeExpr,
    actual: CheckedTypeExpr,
    position: Position
) : CompileTimeError.WithPosition(
    reason = "Expect: ${expected.prettyPrint()}.\nActual: ${actual.prettyPrint()}.",
    position = position
)
