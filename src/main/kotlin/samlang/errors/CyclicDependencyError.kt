package samlang.errors

import samlang.ast.Range

class CyclicDependencyError(sourceName: String, range: Range, cyclicDependencyChain: List<String>) :
    CompileTimeError(
        errorLocation = "$sourceName:$range",
        errorInformation = cyclicDependencyChain.joinToString(separator = "->", postfix = ".")
    )
