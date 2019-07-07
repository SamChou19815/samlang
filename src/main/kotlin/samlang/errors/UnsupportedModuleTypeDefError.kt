package samlang.errors

import samlang.ast.common.Position

class UnsupportedModuleTypeDefError(
    expectedModuleTypeDef: ModuleTypeDef,
    position: Position
) : CompileTimeError.WithPosition(
    reason = "Expect the current module to have type def of ${expectedModuleTypeDef.nameForPrint}, but it doesn't.",
    position = position
) {

    enum class ModuleTypeDef(val nameForPrint: String) {
        OBJECT(nameForPrint = "object"), VARIANT(nameForPrint = "variant")
    }

}
