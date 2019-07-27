package samlang.errors

import samlang.ast.common.Range

class SyntaxError(file: String, range: Range, reason: String) :
    CompileTimeError(file = file, range = range, type = "SyntaxError", reason = reason)
