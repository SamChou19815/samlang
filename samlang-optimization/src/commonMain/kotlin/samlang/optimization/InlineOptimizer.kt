package samlang.optimization

import samlang.ast.mir.MidIrCompilationUnit
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Companion.TEMP
import samlang.ast.mir.MidIrExpression.Constant
import samlang.ast.mir.MidIrExpression.Mem
import samlang.ast.mir.MidIrExpression.Name
import samlang.ast.mir.MidIrExpression.Op
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrFunction
import samlang.ast.mir.MidIrLoweredExpressionVisitor
import samlang.ast.mir.MidIrLoweredStatementVisitor
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.CallFunction
import samlang.ast.mir.MidIrStatement.Companion.MOVE
import samlang.ast.mir.MidIrStatement.ConditionalJumpFallThrough
import samlang.ast.mir.MidIrStatement.Jump
import samlang.ast.mir.MidIrStatement.Label
import samlang.ast.mir.MidIrStatement.MoveMem
import samlang.ast.mir.MidIrStatement.MoveTemp
import samlang.ast.mir.MidIrStatement.Return

@ExperimentalStdlibApi
object InlineOptimizer {
    /** The threshold max tolerable cost of inlining.  */
    private const val INLINE_THRESHOLD = 30
    /** The threshold max tolerable cost of performing inlining.  */
    private const val PERFORM_INLINE_THRESHOLD = 1000

    fun optimize(compilationUnit: MidIrCompilationUnit): MidIrCompilationUnit {
        var tempUnit = compilationUnit
        for (i in 0..4) {
            val functionsToInline = hashSetOf<String>()
            val functionThatCanPerformInlining = hashSetOf<String>()
            val statementInlineCostVisitor = StatementInlineCostVisitor()
            for (function in tempUnit.functions) {
                val functionName = function.functionName
                val cost = getInliningCost(function, statementInlineCostVisitor)
                if (cost <= INLINE_THRESHOLD) {
                    functionsToInline += functionName
                }
                if (cost <= PERFORM_INLINE_THRESHOLD) {
                    functionThatCanPerformInlining += functionName
                }
            }
            functionsToInline.retainAll(statementInlineCostVisitor.mentionedFunctionNames)
            if (functionsToInline.isEmpty()) {
                return tempUnit
            }
            val oldFunctionsMap = tempUnit.functions.asSequence().map { it.functionName to it }.toMap()
            val newFunctions = tempUnit.functions.map { oldFunction ->
                val functionName = oldFunction.functionName
                if (functionName in functionThatCanPerformInlining) {
                    inlineRewrite(
                        irFunction = oldFunction,
                        functionsToInline = functionsToInline.toMutableSet().apply { remove(functionName) },
                        functions = oldFunctionsMap
                    )
                } else {
                    oldFunction
                }
            }
            tempUnit = tempUnit.copy(functions = newFunctions)
        }
        return tempUnit
    }

    /**
     * @param irFunction the ir function to test inlining worthiness.
     * @param visitor the visitor for statements.
     * @return inline cost.
     */
    private fun getInliningCost(irFunction: MidIrFunction, visitor: StatementInlineCostVisitor): Int =
        irFunction.mainBodyStatements.sumBy { it.accept(visitor, Unit) }

    private fun inlineRewrite(
        irFunction: MidIrFunction,
        functionsToInline: Set<String>,
        functions: Map<String, MidIrFunction>
    ): MidIrFunction {
        val newMainBodyStatements = mutableListOf<MidIrStatement>()
        for (oldMainBodyStatement in irFunction.mainBodyStatements) {
            if (oldMainBodyStatement !is CallFunction) {
                newMainBodyStatements += oldMainBodyStatement
                continue
            }
            val (functionExpr, moveArgSources, returnCollector) = oldMainBodyStatement
            if (functionExpr !is Name) {
                newMainBodyStatements += oldMainBodyStatement
                continue
            }
            val functionName = functionExpr.name
            if (functionName !in functionsToInline) {
                newMainBodyStatements += oldMainBodyStatement
                continue
            }
            // definitely need to inline now.
            val (_, moveArgTargets, mainBodyStatements) = functions[functionName]
                ?: error(message = "Missing function: $functionName")
            val inlinedStatementsRewriterVisitor = StatementRewriterVisitor(
                newMainBodyStatements = newMainBodyStatements,
                returnCollector = returnCollector
            )
            // inline step 1: move args to args temp
            val argsLen = moveArgTargets.size
            for (i in 0 until argsLen) {
                val targetTempName = inlinedStatementsRewriterVisitor.transformedTempName(
                    tempName = moveArgTargets[i].id
                )
                newMainBodyStatements += MoveTemp(targetTempName, moveArgSources[i])
            }
            // inline step 2: add in body code and change return statements and label prefix
            for (statementToInline in mainBodyStatements) {
                statementToInline.accept(inlinedStatementsRewriterVisitor, Unit)
            }
            // mark the end of inlining.
            newMainBodyStatements += Label(inlinedStatementsRewriterVisitor.endLabel)
        }
        return irFunction.copy(mainBodyStatements = SimpleOptimizations.optimizeIr(newMainBodyStatements))
    }

    private class StatementInlineCostVisitor : MidIrLoweredStatementVisitor<Unit, Int> {
        val mentionedFunctionNames: MutableSet<String> = hashSetOf()

        override fun visit(node: MoveTemp, context: Unit): Int =
            1 + node.source.accept(ExpressionInlineCostVisitor, Unit)

        override fun visit(node: MoveMem, context: Unit): Int =
            1 + node.source.accept(ExpressionInlineCostVisitor, Unit) +
                    node.memLocation.accept(ExpressionInlineCostVisitor, Unit)

        override fun visit(node: CallFunction, context: Unit): Int {
            var sum = 5
            val functionExpr = node.functionExpr
            if (functionExpr is Name) {
                mentionedFunctionNames += functionExpr.name
            }
            sum += functionExpr.accept(ExpressionInlineCostVisitor, Unit)
            for (arg in node.arguments) {
                sum += arg.accept(ExpressionInlineCostVisitor, Unit)
            }
            if (node.returnCollector != null) {
                sum++
            }
            return sum
        }

        override fun visit(node: Jump, context: Unit): Int = 1

        override fun visit(node: ConditionalJumpFallThrough, context: Unit): Int =
            1 + node.condition.accept(ExpressionInlineCostVisitor, Unit)

        override fun visit(node: Label, context: Unit): Int = 1

        override fun visit(node: Return, context: Unit): Int =
            1 + (node.returnedExpression?.accept(ExpressionInlineCostVisitor, Unit) ?: 0)
    }

    private object ExpressionInlineCostVisitor : MidIrLoweredExpressionVisitor<Unit, Int> {
        override fun visit(node: Constant, context: Unit): Int = 0
        override fun visit(node: Temporary, context: Unit): Int = 0
        override fun visit(node: Name, context: Unit): Int = 0

        override fun visit(node: Op, context: Unit): Int =
            1 + node.e1.accept(visitor = this, context = Unit) + node.e2.accept(visitor = this, context = Unit)

        override fun visit(node: Mem, context: Unit): Int = 1 + node.expression.accept(visitor = this, context = Unit)
    }

    private class StatementRewriterVisitor(
        private val newMainBodyStatements: MutableList<MidIrStatement>,
        private val returnCollector: Temporary?
    ) : MidIrLoweredStatementVisitor<Unit, Unit> {
        private val tempPrefix: String = OptimizationResourceAllocator.nextTemp().id + "_"
        private val labelPrefix: String = OptimizationResourceAllocator.nextLabel() + "_"
        private val expressionRewriterVisitor = ExpressionRewriterVisitor()
        val endLabel: String = OptimizationResourceAllocator.nextLabel()

        fun transformedTempName(tempName: String): String = tempPrefix + tempName

        private fun transformedLabelName(labelName: String): String = labelPrefix + labelName

        private fun transform(expression: MidIrExpression): MidIrExpression =
            expression.accept(expressionRewriterVisitor, Unit)

        override fun visit(node: MoveTemp, context: Unit) {
            newMainBodyStatements += MoveTemp(
                tempId = transformedTempName(tempName = node.tempId),
                source = transform(expression = node.source)
            )
        }

        override fun visit(node: MoveMem, context: Unit) {
            newMainBodyStatements += MoveMem(transform(node.memLocation), transform(node.source))
        }

        override fun visit(node: CallFunction, context: Unit) {
            val functionExpr = transform(node.functionExpr)
            val args = node.arguments.map { transform(expression = it) }
            val returnCollector = node.returnCollector?.let { Temporary(id = transformedTempName(tempName = it.id)) }
            newMainBodyStatements += CallFunction(
                functionExpr = functionExpr,
                arguments = args,
                returnCollector = returnCollector
            )
        }

        override fun visit(node: Jump, context: Unit) {
            newMainBodyStatements += Jump(transformedLabelName(node.label))
        }

        override fun visit(node: ConditionalJumpFallThrough, context: Unit) {
            newMainBodyStatements += ConditionalJumpFallThrough(
                condition = transform(expression = node.condition),
                label1 = transformedLabelName(labelName = node.label1)
            )
        }

        override fun visit(node: Label, context: Unit) {
            newMainBodyStatements += Label(transformedLabelName(node.name))
        }

        override fun visit(node: Return, context: Unit) {
            node.returnedExpression?.let { expression ->
                if (returnCollector != null) {
                    newMainBodyStatements += MOVE(returnCollector, transform(expression = expression))
                }
            }
            // jump to the end of the statements.
            newMainBodyStatements += Jump(endLabel)
        }

        private inner class ExpressionRewriterVisitor : MidIrLoweredExpressionVisitor<Unit, MidIrExpression> {
            override fun visit(node: Constant, context: Unit): MidIrExpression = node
            override fun visit(node: Name, context: Unit): MidIrExpression = node
            override fun visit(node: Temporary, context: Unit): MidIrExpression = TEMP(transformedTempName(node.id))

            override fun visit(node: Op, context: Unit): MidIrExpression =
                Op(node.operator, transform(node.e1), transform(node.e2))

            override fun visit(node: Mem, context: Unit): MidIrExpression = Mem(transform(node.expression))
        }
    }
}
