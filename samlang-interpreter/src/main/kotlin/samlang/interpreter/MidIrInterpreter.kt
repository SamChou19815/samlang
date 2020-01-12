package samlang.interpreter

import samlang.ast.common.ModuleReference
import samlang.ast.mir.MidIrCompilationUnit
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrFunction
import samlang.ast.mir.MidIrLoweredExpressionVisitor
import samlang.ast.mir.MidIrLoweredStatementVisitor
import samlang.ast.mir.MidIrNameEncoder
import samlang.ast.mir.MidIrOperator
import samlang.ast.mir.MidIrStatement

/**
 * Interpret [compilationUnit] using [entryModule]'s main function as the main function.
 *
 * @return the printed string.
 */
fun interpretCompilationUnit(compilationUnit: MidIrCompilationUnit, entryModule: ModuleReference): String {
    val environment = setupEnvironment(compilationUnit = compilationUnit)
    val mainFunctionName = MidIrNameEncoder.encodeFunctionName(
        moduleReference = entryModule,
        className = "Main",
        functionName = "main"
    )
    val function = environment.functions[mainFunctionName] ?: error(message = "Bad function.")
    interpretFunction(irFunction = function, environment = environment, arguments = emptyList())
    return environment.printed.toString()
}

private fun setupEnvironment(compilationUnit: MidIrCompilationUnit): GlobalEnvironment {
    val functions = compilationUnit.functions.map { it.functionName to it }.toMap()
    val globalVariables = hashMapOf<String, Long>()
    val strings = hashMapOf<Long, String>()
    var heapPointer = 10000L
    compilationUnit.globalVariables.forEach { (variable, _, content) ->
        val location = heapPointer
        globalVariables[variable.name] = location
        strings[location] = content
        heapPointer += 8
    }
    val functionsGlobals = hashMapOf<Long, String>()
    compilationUnit.functions.forEach { function ->
        val location = heapPointer
        val name = function.functionName
        globalVariables[name] = location
        functionsGlobals[location] = name
        heapPointer += 8
    }
    return GlobalEnvironment(
        functions = functions,
        globalVariables = globalVariables,
        strings = strings,
        functionsGlobals = functionsGlobals,
        heap = hashMapOf(),
        heapPointer = heapPointer,
        printed = StringBuilder()
    )
}

private fun interpretFunction(irFunction: MidIrFunction, arguments: List<Long>, environment: GlobalEnvironment): Long {
    require(value = irFunction.argumentTemps.size == arguments.size)
    val stackFrame = StackFrame()
    irFunction.argumentTemps.map { it.id }.zip(other = arguments).forEach { (id, value) ->
        stackFrame[id] = value
    }
    val statements = irFunction.mainBodyStatements
    val interpreter = MidIrStatementInterpreter(
        environment = environment,
        expressionVisitor = MidIrExpressionInterpreter(environment = environment),
        statements = statements
    )
    var returnedValue: Long? = null
    while (returnedValue == null) {
        val statement = statements[interpreter.programCounter]
        statement.accept(visitor = interpreter, context = stackFrame)
        returnedValue = stackFrame.returnValue
    }
    return returnedValue
}

private class MidIrStatementInterpreter(
    private val environment: GlobalEnvironment,
    private val expressionVisitor: MidIrExpressionInterpreter,
    statements: List<MidIrStatement>
) : MidIrLoweredStatementVisitor<StackFrame, Unit> {
    private var _programCounter: Int = 0
    private val labelMapping: Map<String, Int>

    val programCounter: Int get() = _programCounter

    init {
        labelMapping = hashMapOf<String, Int>().apply {
            statements.forEachIndexed { index, statement ->
                if (statement is MidIrStatement.Label) {
                    this[statement.name] = index
                }
            }
        }
    }

    override fun visit(node: MidIrStatement.MoveTemp, context: StackFrame) {
        context[node.tempId] = node.source.accept(visitor = expressionVisitor, context = context)
        _programCounter++
    }

    override fun visit(node: MidIrStatement.MoveMem, context: StackFrame) {
        environment.heap[node.memLocation.accept(visitor = expressionVisitor, context = context)] =
            node.source.accept(visitor = expressionVisitor, context = context)
        _programCounter++
    }

    override fun visit(node: MidIrStatement.CallFunction, context: StackFrame) {
        val arguments = node.arguments.map { it.accept(visitor = expressionVisitor, context = context) }
        val functionExpression = node.functionExpr
        val functionName = if (functionExpression is MidIrExpression.Name) {
            val functionName = functionExpression.name
            val result = when (functionName) {
                "builtin_malloc" -> {
                    require(value = arguments.size == 1)
                    val size = arguments[0]
                    val start = environment.heapPointer
                    environment.heapPointer += size
                    start
                }
                "builtin_throw" -> {
                    require(value = arguments.size == 1)
                    val argument = arguments[0]
                    val string = environment.strings[argument] ?: error(message = "Bad string at $argument")
                    throw PanicException(reason = string)
                }
                "builtin_stringToInt" -> {
                    require(value = arguments.size == 1)
                    val argument = arguments[0]
                    val string = environment.strings[argument] ?: error(message = "Bad string at $argument")
                    string.toLongOrNull() ?: throw PanicException(reason = "Bad string: $string")
                }
                "builtin_intToString" -> {
                    require(value = arguments.size == 1)
                    val stringForm = arguments[0].toString()
                    val location = environment.heapPointer
                    environment.heapPointer += 8
                    environment.strings[location] = stringForm
                    location
                }
                "builtin_println" -> {
                    require(value = arguments.size == 1)
                    val argument = arguments[0]
                    val string = environment.strings[argument] ?: error(message = "Bad string at $argument")
                    environment.printed.append(string).append('\n')
                    0L
                }
                else -> null
            }
            if (result != null) {
                node.returnCollector?.let { context[it.id] = result }
                _programCounter++
                return
            }
            functionName
        } else {
            val functionAddress = functionExpression.accept(visitor = expressionVisitor, context = context)
            environment.functionsGlobals[functionAddress]
                ?: error(message = "Undefined function at $functionAddress! Expression: $functionExpression")
        }
        val function = environment.functions[functionName]
            ?: error(message = "Missing function $functionName")
        val result = interpretFunction(
            irFunction = function,
            arguments = arguments,
            environment = environment
        )
        node.returnCollector?.let { context[it.id] = result }
        _programCounter++
    }

    override fun visit(node: MidIrStatement.Jump, context: StackFrame) {
        val label = node.label
        _programCounter = (labelMapping[label] ?: error("BAD label: $label!"))
    }

    override fun visit(node: MidIrStatement.ConditionalJumpFallThrough, context: StackFrame) {
        if (node.condition.accept(visitor = expressionVisitor, context = context) != 0L) {
            visit(node = MidIrStatement.Jump(label = node.label1), context = context)
        } else {
            _programCounter++
        }
    }

    override fun visit(node: MidIrStatement.Label, context: StackFrame) {
        _programCounter++
    }

    override fun visit(node: MidIrStatement.Return, context: StackFrame) {
        val value = node.returnedExpression?.accept(visitor = expressionVisitor, context = context) ?: 0L
        context.returnValue(value = value)
    }
}

private class MidIrExpressionInterpreter(
    private val environment: GlobalEnvironment
) : MidIrLoweredExpressionVisitor<StackFrame, Long> {
    override fun visit(node: MidIrExpression.Constant, context: StackFrame): Long = node.value

    override fun visit(node: MidIrExpression.Name, context: StackFrame): Long =
        environment.globalVariables[node.name] ?: error(message = "Referencing undefined global ${node.name}!")

    override fun visit(node: MidIrExpression.Temporary, context: StackFrame): Long = context[node.id]

    override fun visit(node: MidIrExpression.Op, context: StackFrame): Long {
        val value1 = node.e1.accept(visitor = this, context = context)
        val value2 = node.e2.accept(visitor = this, context = context)
        return when (node.operator) {
            MidIrOperator.MUL -> value1 * value2
            MidIrOperator.DIV -> {
                if (value2 == 0L) {
                    throw PanicException(reason = "Division by zero!")
                }
                value1 / value2
            }
            MidIrOperator.MOD -> {
                if (value2 == 0L) {
                    throw PanicException(reason = "Division by zero!")
                }
                value1 % value2
            }
            MidIrOperator.ADD -> value1 + value2
            MidIrOperator.SUB -> value1 - value2
            MidIrOperator.XOR -> value1 xor value2
            MidIrOperator.LT -> toInt(boolean = value1 < value2)
            MidIrOperator.LE -> toInt(boolean = value1 <= value2)
            MidIrOperator.GT -> toInt(boolean = value1 > value2)
            MidIrOperator.GE -> toInt(boolean = value1 >= value2)
            MidIrOperator.EQ -> toInt(boolean = value1 == value2)
            MidIrOperator.NE -> toInt(boolean = value1 != value2)
            MidIrOperator.AND -> if (value1 == 0L) 0L else if (value2 == 0L) 0L else 1L
            MidIrOperator.OR -> if (value1 != 0L) 1L else if (value2 != 0L) 1L else 0L
        }
    }

    private fun toInt(boolean: Boolean): Long = if (boolean) 1L else 0L

    override fun visit(node: MidIrExpression.Mem, context: StackFrame): Long =
        environment.heap[node.expression.accept(visitor = this, context = context)] ?: 0
}

private class GlobalEnvironment(
    val functions: Map<String, MidIrFunction>,
    val globalVariables: Map<String, Long>,
    val functionsGlobals: Map<Long, String>,
    val strings: MutableMap<Long, String>,
    val heap: MutableMap<Long, Long>,
    var heapPointer: Long,
    val printed: StringBuilder
)

private class StackFrame {
    private val variables: MutableMap<String, Long> = hashMapOf()
    private var _returnedValue: Long? = null

    val returnValue: Long? get() = _returnedValue

    operator fun get(name: String): Long = variables[name] ?: 0

    operator fun set(name: String, value: Long) {
        variables[name] = value
    }

    fun returnValue(value: Long) {
        _returnedValue = value
    }
}
