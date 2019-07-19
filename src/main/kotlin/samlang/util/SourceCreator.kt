package samlang.util

import samlang.ast.Module
import samlang.errors.CompilationFailedException
import samlang.errors.CompileTimeError

fun createSourceOrFail(module: Module, errors: List<CompileTimeError>): Module =
    if (errors.isEmpty()) module else throw CompilationFailedException(errors = errors)
