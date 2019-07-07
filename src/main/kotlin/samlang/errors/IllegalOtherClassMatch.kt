package samlang.errors

import samlang.ast.common.Range

class IllegalOtherClassMatch(range: Range) : CompileTimeError.WithPosition(
    reason = "It is illegal to match on a value of other class's type.",
    range = range
)
