package samlang.parser

import samlang.ast.common.ModuleReference
import samlang.ast.common.Range
import samlang.ast.lang.Module
import samlang.errors.CompileTimeError
import samlang.errors.SyntaxError

import buildTsExpressionFromText
import buildTsModuleFromText
import samlang.ast.common.Position
import samlang.ast.lang.Expression

actual fun buildModuleFromText(moduleReference: ModuleReference, text: String): Pair<Module, List<CompileTimeError>> =
    try {
        val tsModule = buildTsModuleFromText(text)
        transformModule(tsModule = tsModule) to emptyList()
    } catch (error: Throwable) {
        val dummyModule = Module(imports = emptyList(), classDefinitions = emptyList())
        val errorMessage = error.message
        @Suppress("IfThenToElvis")
        val compileTimeErrors = if (errorMessage == null) {
            listOf(SyntaxError(moduleReference = moduleReference, range = Range.DUMMY, reason = ""))
        } else {
            errorMessage.split("$$$").map { oneErrorMessage ->
                val (positionString, reasonString) = oneErrorMessage.split("###")
                val (positionStart, positionEnd) = positionString.split(":").map { it.toInt() }
                val range = Range(
                    start = Position(line = positionStart, column = positionEnd),
                    end = Position(line = positionStart, column = positionEnd + 1)
                )
                SyntaxError(
                    moduleReference = moduleReference,
                    range = range,
                    reason = reasonString
                )
            }
        }
        dummyModule to compileTimeErrors
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
