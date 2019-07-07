package samlang.errors

import samlang.ast.Range

class NotWellDefinedIdentifierError(badIdentifier: String, range: Range) :
    CompileTimeError.WithPosition(reason = "$badIdentifier is not well defined.", range = range)
