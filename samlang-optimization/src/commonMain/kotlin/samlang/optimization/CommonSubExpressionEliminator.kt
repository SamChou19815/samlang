package samlang.optimization

import samlang.analysis.AvailableExpressionAnalysis
import samlang.analysis.ContainsTempDetector
import samlang.ast.common.IrOperator
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.*
import samlang.ast.mir.MidIrExpression.Companion.IMMUTABLE_MEM
import samlang.ast.mir.MidIrExpressionVisitor
import samlang.ast.mir.MidIrLoweredStatementVisitor
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.*
import samlang.ast.mir.MidIrStatement.Companion.MOVE

/**
 * The eliminator for common sub-expressions.
 * It will not try to eliminate simple constant, temp, add, sub, and, or, xor.
 */
@ExperimentalStdlibApi
internal class CommonSubExpressionEliminator private constructor(statements: List<MidIrStatement>) {
    /** The new statements produced after optimization.  */
    private val newStatements: MutableList<MidIrStatement> = mutableListOf()

    init {
        val len = statements.size
        // first pass: initialize all arrays.
        val usageMaps = computeUsageMap(statements = statements)
        val replacementMaps = Array(size = len) { mutableMapOf<MidIrExpression, Temporary>() }
        // second pass: construct the hoisting and replacement map.
        val hoistingMaps = mutableMapOf<Int, MutableMap<Temporary, MidIrExpression>>()
        usageMaps.forEach { (exprToReplace, usage) ->
            if (usage.appearSites.size < usage.useSites.size) {
                // Only hoist expressions when it's used more than it's defined.
                val tempForHoistedExpr = OptimizationResourceAllocator.nextTemp()
                for (usagePlace in usage.useSites) {
                    replacementMaps[usagePlace][exprToReplace] = tempForHoistedExpr
                }
                usage.appearSites.forEach { appearId ->
                    val hoistingMap = hoistingMaps[appearId]
                    if (hoistingMap == null) {
                        hoistingMaps[appearId] = mutableMapOf(tempForHoistedExpr to exprToReplace)
                    } else {
                        hoistingMap[tempForHoistedExpr] = exprToReplace
                    }
                }
            }
        }
        val hoistingLists = (0 until len).map { i ->
            val hoistingMap = hoistingMaps[i] ?: mutableMapOf()
            // cleanup hoisting map to avoid repeated computation of sub expressions.
            val replacementMapForHoistingMap = hoistingMap.map { it.value to it.key }.toMap()
            hoistingMap.asSequence()
                .map { (newTemp, hoistedExpression) ->
                    var simplifiedHoistedExpression = replace(
                        expression = hoistedExpression,
                        replacementMap = replacementMapForHoistingMap
                    )
                    if (newTemp == simplifiedHoistedExpression) {
                        simplifiedHoistedExpression = hoistedExpression
                    }
                    newTemp to simplifiedHoistedExpression
                }
                .sortedWith(Comparator { a, b ->
                    when {
                        ContainsTempDetector.check(b.second, a.first) -> -1 // b must be after a.
                        ContainsTempDetector.check(a.second, a.first) -> 1 // a must be after b
                        else -> 0
                    }
                })
                .toList()
        }
        // third pass: adding hoisting statements and rewrite statements
        for (i in 0 until len) {
            val hoistingList = hoistingLists[i]
            for ((first, second) in hoistingList) {
                newStatements += MOVE(first, second)
            }
            newStatements += statements[i].accept(StatementReplacementVisitor, replacementMaps[i])
        }
    }

    private class ExprUsageCollector(
        private val availableExpressionsOut: Set<MidIrExpression>
    ) : MidIrLoweredStatementVisitor<Int, Unit> {
        private val exprVisitor = ExprVisitor()
        val usageMap: MutableMap<MidIrExpression, MutableSet<Int>> = mutableMapOf()

        private fun fullSearchAndRecord(expr: MidIrExpression, id: Int): Unit = expr.accept(exprVisitor, id)

        override fun visit(node: MoveTemp, context: Int): Unit = fullSearchAndRecord(expr = node.source, id = context)

        override fun visit(node: MoveMem, context: Int) {
            fullSearchAndRecord(expr = node.source, id = context)
            fullSearchAndRecord(expr = IMMUTABLE_MEM(expression = node.memLocation), id = context)
        }

        override fun visit(node: CallFunction, context: Int): Unit =
            node.arguments.forEach { fullSearchAndRecord(it, context) }

        override fun visit(node: Jump, context: Int): Unit = Unit

        override fun visit(node: ConditionalJumpFallThrough, context: Int): Unit =
            fullSearchAndRecord(node.condition, context)

        override fun visit(node: Label, context: Int): Unit = Unit

        override fun visit(node: Return, context: Int) {
            node.returnedExpression?.let { fullSearchAndRecord(it, context) }
        }

        private inner class ExprVisitor : MidIrExpressionVisitor<Int, Unit> {
            private fun searchAndRecord(exprToSearch: MidIrExpression, id: Int) {
                for (expr in availableExpressionsOut) {
                    if (isSimple(expr)) {
                        // simple expressions are not collected. They are cheap to recompute!
                        continue
                    }
                    if (expr == exprToSearch) {
                        val expressionUsages = usageMap[expr]
                        if (expressionUsages == null) {
                            usageMap[expr] = mutableSetOf(id)
                        } else {
                            expressionUsages.add(id)
                        }
                    }
                }
            }

            override fun visit(node: Constant, context: Int): Unit = Unit
            override fun visit(node: Name, context: Int): Unit = Unit
            override fun visit(node: Temporary, context: Int): Unit = Unit

            override fun visit(node: Op, context: Int) {
                searchAndRecord(node, context)
                node.e1.accept(visitor = this, context = context)
                node.e2.accept(visitor = this, context = context)
            }

            override fun visit(node: Mem, context: Int) {
                searchAndRecord(node, context)
                node.expression.accept(visitor = this, context = context)
            }
        }
    }

    private object StatementReplacementVisitor :
        MidIrLoweredStatementVisitor<Map<MidIrExpression, Temporary>, MidIrStatement> {
        override fun visit(node: MoveTemp, context: Map<MidIrExpression, Temporary>): MidIrStatement =
            node.copy(node.tempId, replace(node.source, context))

        override fun visit(node: MoveMem, context: Map<MidIrExpression, Temporary>): MidIrStatement {
            val src = replace(node.source, context)
            val destMemLocation = replace(node.memLocation, context)
            return node.copy(destMemLocation, src)
        }

        override fun visit(node: CallFunction, context: Map<MidIrExpression, Temporary>): MidIrStatement = node.copy(
            functionExpr = replace(node.functionExpr, context),
            arguments = node.arguments.map { replace(it, context) },
            returnCollector = node.returnCollector
        )

        override fun visit(node: Jump, context: Map<MidIrExpression, Temporary>): MidIrStatement = node

        override fun visit(
            node: ConditionalJumpFallThrough,
            context: Map<MidIrExpression, Temporary>
        ): MidIrStatement = ConditionalJumpFallThrough(
            condition = replace(node.condition, context),
            label1 = node.label1
        )

        override fun visit(node: Label, context: Map<MidIrExpression, Temporary>): MidIrStatement = node

        override fun visit(node: Return, context: Map<MidIrExpression, Temporary>): MidIrStatement =
            Return(returnedExpression = node.returnedExpression?.let { replace(it, context) })
    }

    private object ExprReplacementVisitor :
        MidIrExpressionVisitor<Map<MidIrExpression, Temporary>, MidIrExpression> {
        override fun visit(node: Constant, context: Map<MidIrExpression, Temporary>): MidIrExpression {
            if (context.containsKey(node)) {
                throw Error()
            }
            return node
        }

        override fun visit(node: Name, context: Map<MidIrExpression, Temporary>): MidIrExpression {
            if (context.containsKey(node)) {
                throw Error()
            }
            return node
        }

        override fun visit(node: Temporary, context: Map<MidIrExpression, Temporary>): MidIrExpression {
            if (context.containsKey(node)) {
                throw Error()
            }
            return node
        }

        override fun visit(node: Op, context: Map<MidIrExpression, Temporary>): MidIrExpression =
            context[node] ?: Op(
                operator = node.operator,
                e1 = node.e1.accept(visitor = this, context = context),
                e2 = node.e2.accept(visitor = this, context = context)
            )

        override fun visit(node: Mem, context: Map<MidIrExpression, Temporary>): MidIrExpression =
            context[node] ?: node.copy(expression = node.expression.accept(visitor = this, context = context))
    }

    private data class ExpressionUsage(val appearSites: Set<Int>, val useSites: Set<Int>)

    companion object {
        fun optimize(statements: List<MidIrStatement>): List<MidIrStatement> =
            CommonSubExpressionEliminator(statements).newStatements

        /**
         * @param expression the expression to test.
         * @return whether the given expression is a simple add, sub, and, or, xor.
         */
        private fun isPrimitive(expression: MidIrExpression): Boolean =
            expression is Constant || expression is Name || expression is Temporary

        /**
         * @param expression the expression to test.
         * @return whether the given expression is a simple add, sub, and, or, xor.
         */
        private fun isSimple(expression: MidIrExpression): Boolean {
            if (isPrimitive(expression)) {
                return true
            }
            if (expression !is Op) {
                return false
            }
            val (operator, e1, e2) = expression
            when (operator) {
                IrOperator.ADD, IrOperator.SUB, IrOperator.XOR -> Unit
                else -> return false
            }
            return isPrimitive(e1) && isPrimitive(e2)
        }

        private fun computeUsageMap(statements: List<MidIrStatement>): Map<MidIrExpression, ExpressionUsage> {
            val analysisResult = AvailableExpressionAnalysis(statements).expressionOut
            val usageMap = mutableMapOf<MidIrExpression, Pair<MutableSet<Int>, MutableSet<Int>>>()
            statements.forEachIndexed { i, statement ->
                val analysisResultForStatement = analysisResult[i]
                val collector = ExprUsageCollector(analysisResultForStatement.keys)
                statement.accept(collector, i)
                analysisResultForStatement.forEach { (expression, firstAppearSites) ->
                    val appearsAndUses = usageMap[expression]
                    if (appearsAndUses == null) {
                        usageMap[expression] = firstAppearSites.toMutableSet() to mutableSetOf()
                    } else {
                        appearsAndUses.first.addAll(firstAppearSites)
                    }
                }
                collector.usageMap.forEach { (expression, useSites) ->
                    val appearsAndUses = usageMap[expression]
                    if (appearsAndUses == null) {
                        usageMap[expression] = mutableSetOf<Int>() to useSites.toMutableSet()
                    } else {
                        appearsAndUses.second.addAll(useSites)
                    }
                }
            }
            return usageMap.mapValues { (_, pair) ->
                val (appearSites, usageSites) = pair
                ExpressionUsage(appearSites = appearSites, useSites = usageSites)
            }
        }

        private fun replace(
            expression: MidIrExpression,
            replacementMap: Map<MidIrExpression, Temporary>
        ): MidIrExpression = expression.accept(ExprReplacementVisitor, replacementMap)
    }
}
