package samlang.errors

import samlang.ast.checked.CheckedTypeExpr
import samlang.ast.common.Range

class UnexpectedTypeKindError : CompileTimeError.WithPosition {

    constructor(expectedTypeKind: String, actualType: CheckedTypeExpr, range: Range) :
            super(reason = "Expect kind: $expectedTypeKind, actual: ${actualType.prettyPrint()}", range = range)

    constructor(expectedTypeKind: String, actualTypeKind: String, range: Range) :
            super(reason = "Expect kind: $expectedTypeKind, actual kind: $actualTypeKind", range = range)

}

