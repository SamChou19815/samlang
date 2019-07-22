package samlang.util

import samlang.ast.Module
import samlang.errors.CompilationFailedException
import samlang.errors.CompileTimeError

internal fun <T> createOrFail(item: T, errors: List<CompileTimeError>): T =
    if (errors.isEmpty()) item else throw CompilationFailedException(errors = errors)

internal fun createSourceOrFail(module: Module, errors: List<CompileTimeError>): Module =
    createOrFail(item = module, errors = errors)
