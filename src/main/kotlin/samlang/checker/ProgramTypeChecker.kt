package samlang.checker

import samlang.ast.*
import samlang.errors.CompileTimeError
import samlang.util.Either

internal object ProgramTypeChecker {

    fun typeCheck(program: Program, typeCheckingContext: TypeCheckingContext): Either<Program, List<CompileTimeError>> {
        val checkedModules = arrayListOf<Module>()
        var currentContext = typeCheckingContext
        val errorCollector = ErrorCollector()
        for (module in program.modules) {
            val (checkedModule, newCtx) = module.typeCheck(
                errorCollector = errorCollector,
                typeCheckingContext = currentContext
            )
            checkedModule?.let { checkedModules.add(element = it) }
            currentContext = newCtx
        }
        val errors = errorCollector.collectedErrors
        return if (errors.isEmpty()) {
            Either.Left(v = Program(modules = checkedModules))
        } else {
            Either.Right(v = errors)
        }
    }

    fun getCheckedProgramOrThrow(program: Program, typeCheckingContext: TypeCheckingContext): Program =
        when (val result = typeCheck(program = program, typeCheckingContext = typeCheckingContext)) {
            is Either.Left -> result.v
            is Either.Right -> throw result.v[0]
        }

}
