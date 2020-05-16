package samlang.parser

import samlang.ast.common.ModuleReference
import samlang.ast.common.Range
import samlang.ast.lang.Module
import samlang.errors.CompileTimeError
import samlang.errors.SyntaxError

import buildTsExpressionFromText
import buildTsModuleFromText
import samlang.ast.lang.Expression

actual fun buildModuleFromText(moduleReference: ModuleReference, text: String): Pair<Module, List<CompileTimeError>> =
    try {
        val tsModule = buildTsModuleFromText(text)
        transformModule(tsModule = tsModule) to emptyList()
    } catch (error: Throwable) {
        val dummyModule = Module(imports = emptyList(), classDefinitions = emptyList())
        val compileTimeError = SyntaxError(
            moduleReference = moduleReference,
            range = Range.DUMMY,
            reason = error.message ?: ""
        )
        dummyModule to listOf(compileTimeError)
    }

actual fun buildExpressionFromText(
    moduleReference: ModuleReference,
    source: String
): Pair<Expression?, List<CompileTimeError>> =
    try {
        buildTsExpressionFromText(source).accept(TsExpressionTransformVisitor) to emptyList()
    } catch (error: Throwable) {
        val compileTimeError = SyntaxError(
            moduleReference = moduleReference,
            range = Range.DUMMY,
            reason = error.message ?: ""
        )
        null to listOf(compileTimeError)
    }
