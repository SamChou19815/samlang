package samlang.parser

import samlang.ast.common.ModuleReference
import samlang.ast.lang.Expression
import samlang.ast.lang.Module
import samlang.errors.CompileTimeError

expect fun buildModuleFromText(moduleReference: ModuleReference, text: String): Pair<Module, List<CompileTimeError>>

expect fun buildExpressionFromText(
    moduleReference: ModuleReference,
    source: String
): Pair<Expression?, List<CompileTimeError>>
