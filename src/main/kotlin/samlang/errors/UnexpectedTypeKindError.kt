package samlang.errors

import samlang.ast.TypeExpression
import samlang.ast.Range

class UnexpectedTypeKindError : CompileTimeError.WithPosition {

    constructor(expectedTypeKind: String, actualType: TypeExpression, range: Range) :
            super(reason = "Expect kind: $expectedTypeKind, actual: ${actualType.prettyPrint()}", range = range)

    constructor(expectedTypeKind: String, actualTypeKind: String, range: Range) :
            super(reason = "Expect kind: $expectedTypeKind, actual kind: $actualTypeKind", range = range)

}

