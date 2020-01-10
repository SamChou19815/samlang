package samlang.interpreter

import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrFunction
import samlang.ast.mir.MidIrLoweredExpressionVisitor
import samlang.ast.mir.MidIrLoweredStatementVisitor
import samlang.ast.mir.MidIrOperator
import samlang.ast.mir.MidIrStatement

private fun interpretFunction(irFunction: MidIrFunction, arguments: List<Long>, environment: GlobalEnvironment): Long {
    require(value = irFunction.argumentTemps.size == arguments.size)
    val stackFrame = StackFrame()
    irFunction.argumentTemps.map { it.id }.zip(other = arguments).forEach { (id, value) ->
        stackFrame[id] = value
    }
    val statements = irFunction.mainBodyStatements
    val interpreter = MidIrStatementInterpreter(
        heap = environment.heap,
        expressionVisitor = MidIrExpressionInterpreter(
            globalVariables = environment.globalVariables,
            heap = environment.heap
        ),
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
    private val heap: MutableMap<Long, Long>,
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
        heap[node.memLocation.accept(visitor = expressionVisitor, context = context)] =
            node.source.accept(visitor = expressionVisitor, context = context)
        _programCounter++
    }

    override fun visit(node: MidIrStatement.CallFunction, context: StackFrame) {
        TODO(reason = "NOT_IMPLEMENTED")
    }

    override fun visit(node: MidIrStatement.Jump, context: StackFrame) {
        _programCounter = (labelMapping[node.label] ?: error("BAD!"))
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
    private val globalVariables: Map<String, Long>,
    private val heap: Map<Long, Long>
) : MidIrLoweredExpressionVisitor<StackFrame, Long> {
    override fun visit(node: MidIrExpression.Constant, context: StackFrame): Long = node.value
    override fun visit(node: MidIrExpression.Name, context: StackFrame): Long = globalVariables[node.name] ?: 0
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
            MidIrOperator.SUB -> value1 + value2
            MidIrOperator.XOR -> value1 xor value2
            MidIrOperator.LT -> toInt(boolean = value1 < value2)
            MidIrOperator.LE -> toInt(boolean = value1 <= value2)
            MidIrOperator.GT -> toInt(boolean = value1 > value2)
            MidIrOperator.GE -> toInt(boolean = value1 >= value2)
            MidIrOperator.EQ -> toInt(boolean = value1 == value2)
            MidIrOperator.NE -> toInt(boolean = value1 != value2)
            MidIrOperator.AND -> if (value1 == 0L) 0L else if (value2 == 0L) 0L else 1L
            MidIrOperator.OR -> if (value1 == 1L) 1L else if (value2 == 1L) 1L else 0L
        }
    }

    private fun toInt(boolean: Boolean): Long = if (boolean) 1L else 0L

    override fun visit(node: MidIrExpression.Mem, context: StackFrame): Long =
        heap[node.expression.accept(visitor = this, context = context)] ?: 0
}

private class GlobalEnvironment(
    val globalVariables: Map<String, Long>,
    val heap: MutableMap<Long, Long>
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
