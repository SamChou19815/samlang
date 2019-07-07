package samlang.errors

import samlang.ast.common.Position

class InconsistentFieldsInObjectError(
    expectedFields: Set<String>,
    actualFields: Set<String>,
    position: Position
) : CompileTimeError.WithPosition(
    reason = "Inconsistent fields. Expected: $expectedFields, actual: $actualFields",
    position = position
)
