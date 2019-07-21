package samlang.errors

import samlang.ast.ModuleReference
import samlang.ast.Range

class CyclicDependencyError(moduleReference: ModuleReference, range: Range, cyclicDependencyChain: List<String>) :
    CompileTimeError(
        errorLocation = "${moduleReference.toFilename()}:$range",
        errorInformation = cyclicDependencyChain.joinToString(separator = "->", postfix = ".")
    )
