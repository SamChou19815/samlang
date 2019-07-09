package samlang.errors

import samlang.ast.Range

class InconsistentFieldsInObjectError(
    expectedFields: Set<String>,
    actualFields: Set<String>,
    range: Range
) : CompileTimeError.WithRange(
    reason = "Inconsistent fields. Expected: $expectedFields, actual: $actualFields",
    range = range
)
