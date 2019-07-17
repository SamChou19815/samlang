package samlang.util

import samlang.ast.Source
import samlang.errors.CompilationFailedException
import samlang.errors.CompileTimeError

fun createSourceOrFail(source: Source, errors: List<CompileTimeError>): Source =
    if (errors.isEmpty()) source else throw CompilationFailedException(errors = errors)
