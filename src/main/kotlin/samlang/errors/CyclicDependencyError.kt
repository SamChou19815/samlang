package samlang.errors

import samlang.ast.Range

class CyclicDependencyError(moduleName: String, range: Range, cyclicDependencyChain: List<String>) :
    CompileTimeError(
        errorLocation = "$moduleName.sam:$range",
        errorInformation = cyclicDependencyChain.joinToString(separator = "->", postfix = ".")
    )
