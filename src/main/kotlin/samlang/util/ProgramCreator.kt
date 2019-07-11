package samlang.util

import samlang.ast.Program
import samlang.errors.CompilationFailedException
import samlang.errors.CompileTimeError

fun createProgramOrFail(program: Program, errors: List<CompileTimeError>): Program =
    if (errors.isEmpty()) program else throw CompilationFailedException(errors = errors)
