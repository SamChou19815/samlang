package samlang.errors

import samlang.ast.common.ModuleReference
import samlang.ast.common.Range

class SyntaxError(moduleReference: ModuleReference, range: Range, reason: String) :
    CompileTimeError(moduleReference = moduleReference, range = range, type = "SyntaxError", reason = reason)
