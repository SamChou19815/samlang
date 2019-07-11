package samlang.errors

import samlang.ast.Range

class UnsupportedModuleTypeDefError(
    expectedModuleTypeDef: ModuleTypeDef,
    range: Range
) : CompileTimeError.WithRange(
    reason = "Expect the current module to have type def of `${expectedModuleTypeDef.nameForPrint}`, but it doesn't.",
    range = range
) {

    enum class ModuleTypeDef(val nameForPrint: String) {
        OBJECT(nameForPrint = "object"), VARIANT(nameForPrint = "variant")
    }
}
