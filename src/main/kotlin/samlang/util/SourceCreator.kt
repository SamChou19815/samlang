package samlang.util

import samlang.errors.CompilationFailedException
import samlang.errors.CompileTimeError

internal fun <T> createOrFail(item: T, errors: List<CompileTimeError>): T =
    if (errors.isEmpty()) item else throw CompilationFailedException(errors = errors)
