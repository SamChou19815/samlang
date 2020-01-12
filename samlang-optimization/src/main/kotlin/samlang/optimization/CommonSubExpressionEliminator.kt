package samlang.optimization

import java.util.TreeSet
import samlang.analysis.AvailableExpressionAnalysis
import samlang.analysis.AvailableExpressionAnalysis.ExprInfo
import samlang.ast.mir.ContainsTempDetector
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Constant
import samlang.ast.mir.MidIrExpression.Mem
import samlang.ast.mir.MidIrExpression.Name
import samlang.ast.mir.MidIrExpression.Op
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrLoweredExpressionVisitor
import samlang.ast.mir.MidIrLoweredStatementVisitor
import samlang.ast.mir.MidIrOperator
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.CallFunction
import samlang.ast.mir.MidIrStatement.Companion.MOVE
import samlang.ast.mir.MidIrStatement.ConditionalJumpFallThrough
import samlang.ast.mir.MidIrStatement.Jump
import samlang.ast.mir.MidIrStatement.Label
import samlang.ast.mir.MidIrStatement.MoveMem
import samlang.ast.mir.MidIrStatement.MoveTemp
import samlang.ast.mir.MidIrStatement.Return

/**
 * The eliminator for common sub-expressions.
 * It will not try to eliminate simple constant, temp, add, sub, and, or, xor.
 */
internal class CommonSubExpressionEliminator private constructor(statements: List<MidIrStatement>) {
    /** The available analysis into the nodes.  */
    private val out: Array<MutableSet<ExprInfo>> = AvailableExpressionAnalysis(statements).expressionOut
    /** The usage maps. firstAppeared ==> (expr, a set of all usage places).  */
    private val usageMaps: Array<MutableMap<MidIrExpression, MutableSet<Int>>>
    /** The new statements produced after optimization.  */
    private val newStatements: MutableList<MidIrStatement> = arrayListOf()

    init {
        val len = statements.size
        // first pass: initialize all arrays.
        usageMaps = Array(size = len) { hashMapOf<MidIrExpression, MutableSet<Int>>() }
        val replacementMaps = Array(size = len) { hashMapOf<MidIrExpression, Temporary>() }
        // second pass: collector all expression usage info into usageMaps
        for (i in 0 until len) {
            statements[i].accept(ExprUsageCollector(i), Unit)
        }
        // third pass: construct the hoisting and replacement map.
        val hoistingLists = (0 until len).map { i ->
            val usageMap = usageMaps[i]
            val hoistingMap = hashMapOf<Temporary, MidIrExpression>()
            for ((exprToReplace, usageSet) in usageMap) {
                if (usageSet.size <= 1) { // less than one use ==> do not optimize
                    continue
                }
                val tempForHoistedExpr = OptimizationResourceAllocator.nextTemp()
                hoistingMap[tempForHoistedExpr] = exprToReplace
                for (usagePlace in usageSet) {
                    replacementMaps[usagePlace][exprToReplace] = tempForHoistedExpr
                }
            }
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
        // fourth pass: adding hoisting statements and rewrite statements
        for (i in 0 until len) {
            val hoistingList = hoistingLists[i]
            for ((first, second) in hoistingList) {
                newStatements += MOVE(first, second)
            }
            newStatements += statements[i].accept(StatementReplacementVisitor, replacementMaps[i])
        }
    }

    private inner class ExprUsageCollector(
        private val id: Int
    ) : MidIrLoweredStatementVisitor<Unit, Unit> {
        private val exprVisitor = ExprVisitor()
        private val availableExpressionsOut: Set<ExprInfo> = out[id]

        private fun fullSearchAndRecord(expr: MidIrExpression): Unit = expr.accept(exprVisitor, Unit)

        override fun visit(node: MoveTemp, context: Unit): Unit = fullSearchAndRecord(expr = node.source)

        override fun visit(node: MoveMem, context: Unit) {
            fullSearchAndRecord(expr = node.source)
            fullSearchAndRecord(expr = Mem(node.memLocation))
        }

        override fun visit(node: CallFunction, context: Unit): Unit = node.arguments.forEach { fullSearchAndRecord(it) }
        override fun visit(node: Jump, context: Unit): Unit = Unit

        override fun visit(node: ConditionalJumpFallThrough, context: Unit): Unit =
            fullSearchAndRecord(node.condition)

        override fun visit(node: Label, context: Unit): Unit = Unit

        override fun visit(node: Return, context: Unit) {
            node.returnedExpression?.let { fullSearchAndRecord(it) }
        }

        private inner class ExprVisitor : MidIrLoweredExpressionVisitor<Unit, Unit> {
            private fun searchAndRecord(exprToSearch: MidIrExpression) {
                for ((appearId, expr) in availableExpressionsOut) {
                    if (isSimple(expr)) {
                        // simple expressions are not collected. They are cheap to recompute!
                        continue
                    }
                    if (id >= appearId && expr == exprToSearch) {
                        usageMaps[appearId].computeIfAbsent(expr) { TreeSet() }.add(id)
                    }
                }
            }

            override fun visit(node: Constant, context: Unit): Unit = Unit
            override fun visit(node: Name, context: Unit): Unit = Unit
            override fun visit(node: Temporary, context: Unit): Unit = Unit

            override fun visit(node: Op, context: Unit) {
                searchAndRecord(node)
                node.e1.accept(visitor = this, context = Unit)
                node.e2.accept(visitor = this, context = Unit)
            }

            override fun visit(node: Mem, context: Unit) {
                searchAndRecord(node)
                node.expression.accept(visitor = this, context = Unit)
            }
        }
    }

    private object StatementReplacementVisitor :
        MidIrLoweredStatementVisitor<Map<MidIrExpression, Temporary>, MidIrStatement> {
        override fun visit(node: MoveTemp, context: Map<MidIrExpression, Temporary>): MidIrStatement =
            MoveTemp(node.tempId, replace(node.source, context))

        override fun visit(node: MoveMem, context: Map<MidIrExpression, Temporary>): MidIrStatement {
            val src = replace(node.source, context)
            val destMemLocation = replace(node.memLocation, context)
            return MoveMem(destMemLocation, src)
        }

        override fun visit(node: CallFunction, context: Map<MidIrExpression, Temporary>): MidIrStatement = CallFunction(
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
        MidIrLoweredExpressionVisitor<Map<MidIrExpression, Temporary>, MidIrExpression> {
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
            context[node] ?: Mem(node.expression.accept(visitor = this, context = context))
    }

    companion object {
        @JvmStatic
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
                MidIrOperator.ADD, MidIrOperator.SUB,
                MidIrOperator.AND, MidIrOperator.OR, MidIrOperator.XOR -> Unit
                else -> return false
            }
            return isPrimitive(e1) && isPrimitive(e2)
        }

        private fun replace(
            expression: MidIrExpression,
            replacementMap: Map<MidIrExpression, Temporary>
        ): MidIrExpression = expression.accept(ExprReplacementVisitor, replacementMap)
    }
}
