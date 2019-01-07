package samlang.errors

import samlang.parser.Position

class DuplicateFieldDeclarationError(fieldName: String, position: Position) : CompileTimeError.WithPosition(
    reason = "Field name $fieldName is declared twice.",
    position = position
)
