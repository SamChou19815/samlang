package samlang.errors

import samlang.ast.common.ModuleReference
import samlang.ast.common.Range

class CyclicDependencyError(moduleReference: ModuleReference, range: Range, cyclicDependencyChain: List<String>) :
    CompileTimeError(
        file = moduleReference.toFilename(),
        range = range,
        reason = cyclicDependencyChain.joinToString(separator = "->", postfix = ".")
    )
