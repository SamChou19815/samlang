package samlang.errors

import samlang.ast.common.Range

class NotWellDefinedIdentifierError(badIdentifier: String, range: Range) : CompileTimeError.WithRange(
    errorType = "NotWellDefinedIdentifier",
    reason = "`$badIdentifier` is not well defined.",
    range = range
)
