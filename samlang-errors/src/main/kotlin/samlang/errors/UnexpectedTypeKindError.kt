package samlang.errors

import samlang.ast.Range
import samlang.ast.Type

class UnexpectedTypeKindError : CompileTimeError.WithRange {

    constructor(expectedTypeKind: String, actualType: Type, range: Range) :
        super(reason = "Expect kind: `$expectedTypeKind`, actual: `${actualType.prettyPrint()}`.", range = range)

    constructor(expectedTypeKind: String, actualTypeKind: String, range: Range) :
        super(reason = "Expect kind: `$expectedTypeKind`, actual kind: `$actualTypeKind`.", range = range)
}
