package samlang.errors

import samlang.ast.common.Position

class DuplicateFieldDeclarationError(fieldName: String, position: Position) : CompileTimeError.WithPosition(
    reason = "Field name $fieldName is declared twice.",
    position = position
)
