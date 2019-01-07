package samlang.interpreter

import kotlinx.collections.immutable.plus
import samlang.ast.checked.CheckedModule
import samlang.ast.checked.CheckedProgram

internal object ProgramInterpreter {

    fun eval(program: CheckedProgram, context: InterpretationContext): Value {
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
