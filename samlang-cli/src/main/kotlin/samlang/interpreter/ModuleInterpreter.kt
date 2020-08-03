package samlang.interpreter

import kotlinx.collections.immutable.plus
import samlang.ast.lang.ClassDefinition
import samlang.ast.lang.Expression
import samlang.ast.lang.Module

/** The interpreter used to evaluate an already type checked source with single module. */
class ModuleInterpreter {
    private val expressionInterpreter: ExpressionInterpreter = ExpressionInterpreter()

    val printed: String get() = expressionInterpreter.printed

    /**
     * Run the [module] under some interpretation [context] (default to empty)
     * to get all printed strings or a [PanicException].
     */
    fun run(module: Module, context: InterpretationContext = InterpretationContext.EMPTY): String {
        eval(module = module, context = context)
        return expressionInterpreter.printed
    }

    /**
     * Evaluate the [module] under some interpretation [context] (default to empty)
     * to either a value or a [PanicException].
     */
    fun eval(module: Module, context: InterpretationContext = InterpretationContext.EMPTY): Value {
        try {
            return unsafeEval(module = module, context = context)
        } catch (e: Throwable) {
            throw PanicException(reason = "Interpreter Error.")
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
        return expressionInterpreter.eval(expression = mainFunction.body, context = mainFunction.context)
    }

    private fun eval(classDefinition: ClassDefinition, context: InterpretationContext): InterpretationContext {
        val functions = mutableMapOf<String, Value.FunctionValue>()
        val methods = mutableMapOf<String, Value.FunctionValue>()
        classDefinition.members.forEach { member ->
            val lambda = Expression.Lambda(
                range = member.range,
                type = member.type,
                parameters = member.parameters.map { it.name to it.type },
                captured = emptyMap(),
                body = member.body
            )
            val value = expressionInterpreter.visit(expression = lambda, context = context)
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
