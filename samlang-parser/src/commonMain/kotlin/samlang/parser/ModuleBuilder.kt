package samlang.parser

import samlang.ast.common.ModuleReference
import samlang.ast.lang.Module
import samlang.errors.CompileTimeError

expect fun buildModuleFromText(moduleReference: ModuleReference, text: String): Pair<Module, List<CompileTimeError>>
