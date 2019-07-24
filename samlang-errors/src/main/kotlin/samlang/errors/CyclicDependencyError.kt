package samlang.errors

import samlang.ast.ModuleReference
import samlang.ast.Range

class CyclicDependencyError(moduleReference: ModuleReference, range: Range, cyclicDependencyChain: List<String>) :
    CompileTimeError(
        file = moduleReference.toFilename(),
        range = range,
        reason = cyclicDependencyChain.joinToString(separator = "->", postfix = ".")
    )
