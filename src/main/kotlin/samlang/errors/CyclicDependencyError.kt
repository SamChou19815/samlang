package samlang.errors

import samlang.ast.Range

class CyclicDependencyError(sourceName: String, range: Range, cyclicDependencyChain: List<String>) :
    CompileTimeError(
        errorInformation = "$sourceName:$range: ${cyclicDependencyChain.joinToString(separator = "->")}."
    )
