package samlang.errors

import samlang.ast.common.Range

class InconsistentFieldsInObjectError(
    expectedFields: Set<String>,
    actualFields: Set<String>,
    range: Range
) : CompileTimeError.WithRange(
    reason = "Inconsistent fields. Expected: `$expectedFields`, actual: `$actualFields`.",
    range = range
)
