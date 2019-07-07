package samlang.errors

import samlang.ast.checked.CheckedTypeExpr
import samlang.ast.common.Position

class UnexpectedTypeKindError : CompileTimeError.WithPosition {

    constructor(expectedTypeKind: String, actualType: CheckedTypeExpr, position: Position) :
            super(reason = "Expect kind: $expectedTypeKind, actual: ${actualType.prettyPrint()}", position = position)

    constructor(expectedTypeKind: String, actualTypeKind: String, position: Position) :
            super(reason = "Expect kind: $expectedTypeKind, actual kind: $actualTypeKind", position = position)

}

