package samlang.errors

import samlang.ast.common.Range

class InsufficientTypeInferenceContextError(range: Range) : CompileTimeError.WithRange(
    errorType = "InsufficientTypeInferenceContext",
    reason = "There is not enough context information to decide the type of this expression.",
    range = range
)
