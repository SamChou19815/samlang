package samlang.errors

import samlang.ast.Range

class DuplicateFieldDeclarationError(fieldName: String, range: Range) : CompileTimeError.WithPosition(
    reason = "Field name $fieldName is declared twice.",
    range = range
)
