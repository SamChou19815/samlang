package samlang.analysis

import kotlinx.collections.immutable.PersistentMap
import kotlinx.collections.immutable.persistentMapOf
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Companion.IMMUTABLE_MEM
import samlang.ast.mir.MidIrExpression.Constant
import samlang.ast.mir.MidIrExpression.Mem
import samlang.ast.mir.MidIrExpression.Name
import samlang.ast.mir.MidIrExpression.Op
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrLoweredExpressionVisitor
import samlang.ast.mir.MidIrLoweredStatementVisitor
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.CallFunction
import samlang.ast.mir.MidIrStatement.ConditionalJumpFallThrough
import samlang.ast.mir.MidIrStatement.Jump
import samlang.ast.mir.MidIrStatement.MoveMem
import samlang.ast.mir.MidIrStatement.MoveTemp

/**
 * The class that provides the local value numbering analysis result.
 *
 * @param statements the statements to obtain local value numbering analysis result.
 */
@ExperimentalStdlibApi
class LocalValueNumberingAnalysis(statements: List<MidIrStatement>) {
    private val graph: ControlFlowGraph<MidIrStatement> = ControlFlowGraph.fromIr(functionStatements = statements)
    val numberingInfoListIn: Array<NumberingInfo?>
    private val visited: MutableSet<Int> = mutableSetOf()
    /** The visitor that extracts all the information of numbering. */
    private val infoCollectorVisitor: NumberingInfoCollectorVisitor
    /** The next number to use as number identifier. */
    private var nextNumberToUse: Int = 0

    init {
        val len = statements.size
        numberingInfoListIn = arrayOfNulls(len)
        infoCollectorVisitor = NumberingInfoCollectorVisitor()
        computeLocalValueNumberingInfo()
    }

    private fun computeLocalValueNumberingInfo() {
        val workList = ArrayDeque<ControlFlowGraph.Node<MidIrStatement>>()
        workList.add(graph.startNode)
        while (!workList.isEmpty()) {
            val start = workList.removeFirst()
            dfs(node = start, isFirst = true, info = NumberingInfo(), workList = workList)
        }
    }

    /**
     * Perform a DFS to compute and record all numbering info entering and leaving the node.
     *
     * @param node the starting node.
     * @param info the numbering info entering the node.
     */
    private fun dfs(
        node: ControlFlowGraph.Node<MidIrStatement>,
        isFirst: Boolean,
        info: NumberingInfo,
        workList: ArrayDeque<ControlFlowGraph.Node<MidIrStatement>>
    ) {
        val id = node.id
        if (visited.contains(id)) {
            return
        }
        if (!isFirst && graph.getParentIds(id).size > 1) {
            // multiple entry points, not a good start
            workList.add(node)
            return
        }
        if (!visited.add(id)) {
            return
        }
        numberingInfoListIn[id] = info
        val newInfo = node.instruction.accept(infoCollectorVisitor, info)
        graph.getChildren(id).forEach { childrenNode ->
            dfs(node = childrenNode, isFirst = false, info = newInfo, workList = workList)
        }
    }

    private fun allocateNextNumbering(): Int = nextNumberToUse++

    /** Given a local numbering info in, compute the local numbering info out. */
    private inner class NumberingInfoCollectorVisitor :
        MidIrLoweredStatementVisitor<NumberingInfo, NumberingInfo> {
        private val exprVisitor: ExprVisitor = ExprVisitor()

        /**
         * @param info the prev info.
         * @param expr the potential new expr.
         * @return the new info, with a potential new binding of (expr -> new number)
         */
        private fun plus(info: NumberingInfo, expr: MidIrExpression): NumberingInfo =
            if (info.info.containsKey(expr)) info else info.plus(expr, allocateNextNumbering())

        /**
         * @param info the prev info.
         * @param expr the potential new expr, with all of its sub-expressions considered.
         * @return the new info.
         */
        private fun plusFromAllSubExpressions(
            info: NumberingInfo,
            expr: MidIrExpression
        ): NumberingInfo = expr.accept(visitor = exprVisitor, context = info)

        override fun visit(node: MoveTemp, context: NumberingInfo): NumberingInfo {
            val source = node.source
            val destId = node.tempId
            val newInfo = plusFromAllSubExpressions(info = context, expr = source)
            val newInfoWithoutThisTemp = newInfo.withAllExprContainingGivenTempRemoved(destId)
            val sourceNumber = newInfoWithoutThisTemp.info[source]
            val newTemp = Temporary(id = destId)
            return if (sourceNumber == null) {
                newInfoWithoutThisTemp.plus(num = allocateNextNumbering(), temp = newTemp)
            } else {
                newInfoWithoutThisTemp.plus(num = sourceNumber, temp = newTemp)
            }
        }

        override fun visit(node: MoveMem, context: NumberingInfo): NumberingInfo {
            val newInfo = plusFromAllSubExpressions(info = context, expr = node.source)
            val newInfoWithoutMem = newInfo.withAllMemRemoved()
            return plusFromAllSubExpressions(
                info = newInfoWithoutMem,
                expr = IMMUTABLE_MEM(expression = node.memLocation)
            )
        }

        override fun visit(node: CallFunction, context: NumberingInfo): NumberingInfo {
            val newInfoWithArgs = node.arguments.fold(initial = context) { accumulator, expr ->
                plusFromAllSubExpressions(info = accumulator, expr = expr)
            }
            val returnCollectorName = node.returnCollector?.id ?: return newInfoWithArgs
            return newInfoWithArgs
                .withAllExprContainingGivenTempRemoved(returnCollectorName)
                .plus(allocateNextNumbering(), Temporary(id = returnCollectorName))
        }

        override fun visit(node: Jump, context: NumberingInfo): NumberingInfo = context

        override fun visit(
            node: ConditionalJumpFallThrough,
            context: NumberingInfo
        ): NumberingInfo = plusFromAllSubExpressions(context, node.condition)

        override fun visit(node: MidIrStatement.Label, context: NumberingInfo): NumberingInfo = context

        override fun visit(node: MidIrStatement.Return, context: NumberingInfo): NumberingInfo =
            node.returnedExpression?.let { returnedExpression -> plus(context, returnedExpression) } ?: context

        private inner class ExprVisitor : MidIrLoweredExpressionVisitor<NumberingInfo, NumberingInfo> {
            override fun visit(node: Constant, context: NumberingInfo): NumberingInfo = context
            override fun visit(node: Name, context: NumberingInfo): NumberingInfo = context
            override fun visit(node: Temporary, context: NumberingInfo): NumberingInfo = plus(context, node)

            override fun visit(node: Op, context: NumberingInfo): NumberingInfo {
                val info1 = node.e1.accept(visitor = this, context = context)
                val info2 = node.e2.accept(visitor = this, context = info1)
                return plus(info = info2, expr = node)
            }

            override fun visit(node: Mem, context: NumberingInfo): NumberingInfo =
                plus(node.expression.accept(visitor = this, context = context), node)
        }
    }

    data class NumberingInfo(
        val info: PersistentMap<MidIrExpression, Int> = persistentMapOf(),
        val numToTempMap: PersistentMap<Int, Temporary> = persistentMapOf()
    ) {
        /**
         * Add an expression and number binding.
         *
         * @param expr the expression.
         * @param num the numbering.
         * @return the new immutable info with the given new bindings.
         */
        fun plus(expr: MidIrExpression, num: Int): NumberingInfo =
            NumberingInfo(info.put(key = expr, value = num), numToTempMap)

        /**
         * Add a number and temp binding.
         *
         * @param num the numbering.
         * @param temp the temp.
         * @return the new immutable info with the given new bindings.
         */
        fun plus(num: Int, temp: Temporary): NumberingInfo =
            NumberingInfo(info = info.put(temp, num), numToTempMap = numToTempMap.put(num, temp))

        private fun withAllGivenNumbersRemoved(numbersToRemove: Set<Int>): NumberingInfo {
            var newInfo = info
            var newNumToTempMap = numToTempMap
            for ((key, value) in info) {
                if (numbersToRemove.contains(value)) {
                    newInfo = newInfo.remove(key)
                }
            }
            for (num in numToTempMap.keys) {
                if (numbersToRemove.contains(num)) {
                    newNumToTempMap = newNumToTempMap.remove(num)
                }
            }
            return NumberingInfo(newInfo, newNumToTempMap)
        }

        /**
         * @param name the temp name to check.
         * @return the new immutable info with all expressions containing given temp removed.
         */
        fun withAllExprContainingGivenTempRemoved(name: String): NumberingInfo {
            val numbersToRemove = mutableSetOf<Int>()
            for ((key, value) in info) {
                if (ContainsTempDetector.check(key, Temporary(name))) {
                    numbersToRemove.add(value)
                }
            }
            return withAllGivenNumbersRemoved(numbersToRemove)
        }

        /** @return the new immutable info with all expressions containing mem removed. */
        fun withAllMemRemoved(): NumberingInfo {
            val numbersToRemove = mutableSetOf<Int>()
            for ((key, value) in info) {
                if (HasMemDetector.hasMem(key)) {
                    numbersToRemove.add(value)
                }
            }
            return withAllGivenNumbersRemoved(numbersToRemove)
        }

        /**
         * Potentially replace the given IR expression by a temp with the info of this object.
         *
         * @param source the source object to rewrite.
         * @return the potential temp replacement.
         */
        fun replaceWithTemp(source: MidIrExpression): Temporary? {
            val number = info[source]
            return if (number == null) null else numToTempMap[number]
        }
    }
}
