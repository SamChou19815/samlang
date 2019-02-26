package samlang.interpreter

import kotlinx.collections.immutable.plus
import samlang.ast.checked.CheckedModule
import samlang.ast.checked.CheckedProgram

/**
 * The interpreter used to evaluate an already type checked program.
 */
internal object ProgramInterpreter {

    /**
     * Evaluate the [program] under some interpretation [context] (default to empty)
     * to either a value or a [PanicException].
     */
    fun eval(program: CheckedProgram, context: InterpretationContext = InterpretationContext.EMPTY): Value {
        try {
            return unsafeEval(program = program, context = context)
        } catch (e: StackOverflowError) {
            throw PanicException(reason = e.message?.let { "StackOverflowException: $it" } ?: "StackOverflowException")
        } catch (e: IllegalArgumentException) {
            throw PanicException(
                reason = e.message?.let { "IllegalArgumentException: $it" } ?: "IllegalArgumentException"
            )
        } catch (e: ArithmeticException) {
            throw PanicException(reason = e.message?.let { "ArithmeticException: $it" } ?: "ArithmeticException")
        } catch (e: UnsupportedOperationException) {
            throw PanicException(
                reason = e.message?.let { "UnsupportedOperationException: $it" } ?: "UnsupportedOperationException"
            )
        } catch (e: IllegalAccessException) {
            throw PanicException(reason = e.message?.let { "IllegalAccessException: $it" } ?: "IllegalAccessException")
        } catch (e: ThreadDeath) {
            throw PanicException(reason = "My thread is dead.")
        } catch (e: Throwable) {
            e.printStackTrace()
            throw PanicException(reason = "Internal Interpreter Error. We will investigate.")
        }
    }

    /**
     * Evaluate the program directly, without considering stack overflow and other errors beyond our control.
     */
    private fun unsafeEval(program: CheckedProgram, context: InterpretationContext): Value {
        val fullCtx = program.modules.fold(initial = context) { ctx, module -> eval(module = module, context = ctx) }
        val mainModule = fullCtx.modules["Main"] ?: return Value.UnitValue
        val mainFunction = mainModule.functions["main"] ?: return Value.UnitValue
        if (mainFunction.arguments.isNotEmpty()) {
            return Value.UnitValue
        }
        return ExprInterpreter.eval(expr = mainFunction.body, context = mainFunction.context)
    }

    private fun eval(module: CheckedModule, context: InterpretationContext): InterpretationContext {
        val functions = hashMapOf<String, Value.FunctionValue>()
        val methods = hashMapOf<String, Value.FunctionValue>()
        module.members.forEach { member ->
            val v = ExprInterpreter.visit(expr = member.value, context = context)
            if (member.isMethod) {
                methods[member.name] = v
            } else {
                functions[member.name] = v
            }
        }
        val newModule = InterpretationContext.ModuleValue(
            functions = functions,
            methods = methods
        )
        val newContext = context.copy(modules = context.modules.plus(pair = module.name to newModule))
        // patch the functions and methods with correct context.
        functions.forEach { _, v -> v.context = newContext }
        methods.forEach { _, v -> v.context = newContext }
        return newContext
    }

}
