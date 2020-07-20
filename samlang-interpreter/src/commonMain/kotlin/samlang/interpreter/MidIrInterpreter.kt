package samlang.interpreter

import samlang.ast.common.IrNameEncoder
import samlang.ast.common.IrOperator
import samlang.ast.mir.MidIrCompilationUnit
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrFunction
import samlang.ast.mir.MidIrLoweredExpressionVisitor
import samlang.ast.mir.MidIrLoweredStatementVisitor
import samlang.ast.mir.MidIrStatement

/**
 * Interpret [compilationUnit] using [entryModule]'s main function as the main function.
 *
 * @return the printed string.
 */
fun interpretCompilationUnit(compilationUnit: MidIrCompilationUnit): String {
    val environment = setupEnvironment(compilationUnit = compilationUnit)
    val function = environment.functions[IrNameEncoder.compiledProgramMain] ?: error(message = "Bad function.")
    interpretFunction(irFunction = function, environment = environment, arguments = emptyList())
    return environment.printed.toString()
}

private fun setupEnvironment(compilationUnit: MidIrCompilationUnit): GlobalEnvironment {
    val functions = compilationUnit.functions.map { it.functionName to it }.toMap()
    val globalVariables = mutableMapOf<String, Long>()
    val strings = mutableMapOf<Long, String>()
    var heapPointer = 10000L
    compilationUnit.globalVariables.forEach { (name, content) ->
        val location = heapPointer
        globalVariables[name] = location
        strings[location + 8] = content
        heapPointer += 8
    }
    val functionsGlobals = mutableMapOf<Long, String>()
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
        heap = mutableMapOf(),
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
        labelMapping = mutableMapOf<String, Int>().apply {
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
                IrNameEncoder.nameOfMalloc -> {
                    require(value = arguments.size == 1)
                    val size = arguments[0]
                    val start = environment.heapPointer
                    environment.heapPointer += size
                    start
                }
                IrNameEncoder.nameOfThrow -> {
                    require(value = arguments.size == 1)
                    val argument = arguments[0]
                    val string = environment.strings[argument] ?: error(message = "Bad string at $argument")
                    throw PanicException(reason = string)
                }
                IrNameEncoder.nameOfStringToInt -> {
                    require(value = arguments.size == 1)
                    val argument = arguments[0]
                    val string = environment.strings[argument] ?: error(message = "Bad string at $argument")
                    string.toLongOrNull() ?: throw PanicException(reason = "Bad string: $string")
                }
                IrNameEncoder.nameOfIntToString -> {
                    require(value = arguments.size == 1)
                    val stringForm = arguments[0].toString()
                    val location = environment.heapPointer
                    environment.heapPointer += 8
                    environment.strings[location] = stringForm
                    location
                }
                IrNameEncoder.nameOfStringConcat -> {
                    require(value = arguments.size == 2)
                    val string1 = environment.strings[arguments[0]] ?: error(message = "Bad string at ${arguments[0]}")
                    val string2 = environment.strings[arguments[1]] ?: error(message = "Bad string at ${arguments[1]}")
                    val location = environment.heapPointer
                    environment.heapPointer += 8
                    environment.strings[location] = string1 + string2
                    location
                }
                IrNameEncoder.nameOfPrintln -> {
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
            IrOperator.MUL -> value1 * value2
            IrOperator.DIV -> {
                if (value2 == 0L) {
                    throw PanicException(reason = "Division by zero!")
                }
                value1 / value2
            }
            IrOperator.MOD -> {
                if (value2 == 0L) {
                    throw PanicException(reason = "Division by zero!")
                }
                value1 % value2
            }
            IrOperator.ADD -> value1 + value2
            IrOperator.SUB -> value1 - value2
            IrOperator.XOR -> value1 xor value2
            IrOperator.LT -> toInt(boolean = value1 < value2)
            IrOperator.LE -> toInt(boolean = value1 <= value2)
            IrOperator.GT -> toInt(boolean = value1 > value2)
            IrOperator.GE -> toInt(boolean = value1 >= value2)
            IrOperator.EQ -> toInt(boolean = value1 == value2)
            IrOperator.NE -> toInt(boolean = value1 != value2)
            IrOperator.AND -> if (value1 == 0L) 0L else if (value2 == 0L) 0L else 1L
            IrOperator.OR -> if (value1 != 0L) 1L else if (value2 != 0L) 1L else 0L
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
    private val variables: MutableMap<String, Long> = mutableMapOf()
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
