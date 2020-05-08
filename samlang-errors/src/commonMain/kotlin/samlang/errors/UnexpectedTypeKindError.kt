package samlang.errors

import samlang.ast.common.Range
import samlang.ast.common.Type

class UnexpectedTypeKindError : CompileTimeError.WithRange {

    constructor(expectedTypeKind: String, actualType: Type, range: Range) : super(
        errorType = "UnexpectedTypeKind",
        reason = "Expect kind: `$expectedTypeKind`, actual: `${actualType.prettyPrint()}`.",
        range = range
    )

    constructor(expectedTypeKind: String, actualTypeKind: String, range: Range) : super(
        errorType = "UnexpectedTypeKind",
        reason = "Expect kind: `$expectedTypeKind`, actual kind: `$actualTypeKind`.",
        range = range
    )
}
