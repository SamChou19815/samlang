package samlang.errors

import samlang.ast.common.ModuleReference
import samlang.ast.common.Range

class SyntaxError(moduleReference: ModuleReference, range: Range, reason: String) :
    CompileTimeError(errorType = "SyntaxError", moduleReference = moduleReference, range = range, reason = reason)
