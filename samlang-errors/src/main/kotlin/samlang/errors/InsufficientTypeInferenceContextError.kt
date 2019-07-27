package samlang.errors

import samlang.ast.common.Range

class InsufficientTypeInferenceContextError(range: Range) : CompileTimeError.WithRange(
    reason = "There is not enough context information to decide the type of this expression.",
    range = range
)
