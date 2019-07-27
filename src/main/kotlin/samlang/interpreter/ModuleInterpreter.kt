package samlang.interpreter

import kotlinx.collections.immutable.plus
import samlang.ast.lang.ClassDefinition
import samlang.ast.lang.Expression
import samlang.ast.lang.Module

/**
 * The interpreter used to evaluate an already type checked source with single module.
 */
internal object ModuleInterpreter {

    /**
     * Evaluate the [module] under some interpretation [context] (default to empty)
     * to either a value or a [PanicException].
     */
    fun eval(module: Module, context: InterpretationContext = InterpretationContext.EMPTY): Value {
        try {
            return unsafeEval(module = module, context = context)
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
     * Evaluate the module directly, without considering stack overflow and other errors beyond our control.
     */
    private fun unsafeEval(module: Module, context: InterpretationContext): Value {
        val fullCtx = module.classDefinitions.fold(initial = context) { newContext, classDefinition ->
            eval(classDefinition = classDefinition, context = newContext)
        }
        val mainModule = fullCtx.classes["Main"] ?: return Value.UnitValue
        val mainFunction = mainModule.functions["main"] ?: return Value.UnitValue
        if (mainFunction.arguments.isNotEmpty()) {
            return Value.UnitValue
        }
        return ExpressionInterpreter.eval(expression = mainFunction.body, context = mainFunction.context)
    }

    private fun eval(classDefinition: ClassDefinition, context: InterpretationContext): InterpretationContext {
        val functions = hashMapOf<String, Value.FunctionValue>()
        val methods = hashMapOf<String, Value.FunctionValue>()
        classDefinition.members.forEach { member ->
            val lambda = Expression.Lambda(
                range = member.range,
                type = member.type,
                parameters = member.parameters.map { it.name to it.type },
                body = member.body
            )
            val value = ExpressionInterpreter.visit(expression = lambda, context = context)
            if (member.isMethod) {
                methods[member.name] = value
            } else {
                functions[member.name] = value
            }
        }
        val newModule = InterpretationContext.ClassValue(
            functions = functions,
            methods = methods
        )
        val newContext = context.copy(classes = context.classes.plus(pair = classDefinition.name to newModule))
        // patch the functions and methods with correct context.
        functions.forEach { (_, v) -> v.context = newContext }
        methods.forEach { (_, v) -> v.context = newContext }
        return newContext
    }
}
