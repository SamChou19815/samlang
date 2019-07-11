package samlang.errors

import samlang.ast.Type
import samlang.ast.Range

class UnexpectedTypeKindError : CompileTimeError.WithRange {

    constructor(expectedTypeKind: String, actualType: Type, range: Range) :
            super(reason = "Expect kind: $expectedTypeKind, actual: ${actualType.prettyPrint()}", range = range)

    constructor(expectedTypeKind: String, actualTypeKind: String, range: Range) :
            super(reason = "Expect kind: $expectedTypeKind, actual kind: $actualTypeKind", range = range)
}
