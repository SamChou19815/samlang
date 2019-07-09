package samlang.errors

import samlang.ast.Range

class InsufficientTypeInferenceContextError(range: Range) : CompileTimeError.WithRange(
    reason = "There is not enough context information to decide the type of this expression.",
    range = range
)
