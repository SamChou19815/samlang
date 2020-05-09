package samlang.parser

import samlang.ast.common.ModuleReference
import samlang.ast.lang.Module
import samlang.errors.CompileTimeError

actual fun buildModuleFromText(moduleReference: ModuleReference, text: String): Pair<Module, List<CompileTimeError>> {
    throw Error()
}
