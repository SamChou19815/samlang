package samlang.optimization

import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrFunction
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.Companion.MOVE

object TailRecursionOptimizer {
    fun optimize(function: MidIrFunction): MidIrFunction {
        val selfCallIds = mutableSetOf<Int>()
        val oldStatements = function.mainBodyStatements
        // First pass: find and check that all self-call statements are tail-recursive.
        oldStatements.forEachIndexed { index, statement ->
            if (index >= oldStatements.size - 1) {
                return@forEachIndexed
            }
            if (statement !is MidIrStatement.CallFunction) {
                return@forEachIndexed
            }
            val functionExpression = statement.functionExpr as? MidIrExpression.Name ?: return@forEachIndexed
            if (functionExpression.name != function.functionName) {
                return@forEachIndexed
            }
            val collector = statement.returnCollector
            val acceptableCollectors = collector?.let { mutableSetOf(it) } ?: mutableSetOf()
            for (nextStatementIndex in (index + 1) until oldStatements.size) {
                val nextStatement = oldStatements[nextStatementIndex]
                if (nextStatement is MidIrStatement.Label) {
                    continue
                }
                if (nextStatement is MidIrStatement.MoveTemp) {
                    if (nextStatement.source !in acceptableCollectors) {
                        return@forEachIndexed
                    }
                    acceptableCollectors.add(element = MidIrExpression.Temporary(id = nextStatement.tempId))
                } else if (nextStatement is MidIrStatement.Return) {
                    val returnedExpression = nextStatement.returnedExpression
                    if (returnedExpression != null && returnedExpression !in acceptableCollectors) {
                        // Cannot optimize. The self call is not at the tail.
                        return@forEachIndexed
                    }
                    selfCallIds += index
                    break
                }
            }
        }
        if (selfCallIds.isEmpty()) {
            return function // No need to optimize.
        }
        val startLabel = OptimizationResourceAllocator.nextLabel()
        val newStatements = mutableListOf<MidIrStatement>()
        newStatements += MidIrStatement.Label(name = startLabel)
        oldStatements.forEachIndexed { index, statement ->
            if (index !in selfCallIds) {
                newStatements += statement
                return@forEachIndexed
            }
            val callFunction = statement as MidIrStatement.CallFunction
            val argumentTemps = function.argumentTemps
            val argumentExpressions = callFunction.arguments
            require(value = argumentTemps.size == argumentExpressions.size)
            argumentTemps.zip(other = argumentExpressions).forEach { (temp, expression) ->
                newStatements += MOVE(destination = temp, source = expression)
            }
            newStatements += MidIrStatement.Jump(label = startLabel)
        }
        return function.copy(mainBodyStatements = newStatements)
    }
}
