package samlang.errors

import samlang.ast.common.Range

class DuplicateFieldDeclarationError(fieldName: String, range: Range) : CompileTimeError.WithRange(
    errorType = "DuplicateFieldDeclaration",
    reason = "Field name `$fieldName` is declared twice.",
    range = range
)
