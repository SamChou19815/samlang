package samlang.compiler.asm.tiling

import samlang.ast.asm.AssemblyArgs
import samlang.ast.asm.AssemblyArgs.CONST
import samlang.ast.asm.AssemblyArgs.MEM
import samlang.ast.asm.AssemblyArgs.MEM_MUL
import samlang.ast.asm.AssemblyArgs.Mem.MultipleOf
import samlang.ast.asm.AssemblyArgs.Mem.MultipleOf.MultipliedConstant
import samlang.ast.asm.AssemblyArgs.NAME
import samlang.ast.asm.AssemblyArgs.REG
import samlang.ast.asm.AssemblyArgs.RIP
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.Companion.COMMENT
import samlang.ast.common.IrOperator
import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Constant
import samlang.ast.mir.MidIrExpression.Name
import samlang.ast.mir.MidIrExpression.Op
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrExpressionVisitor

/**
 * The helper class for tiling a mem expression node.
 * The result should be used by other strategies
 */
internal object MemTilingHelper {
    private fun better(r1: MemTilingResult?, r2: MemTilingResult): MemTilingResult {
        if (r1 == null) {
            return r2
        }
        return if (r1.cost < r2.cost) r1 else r2
    }

    /**
     * @param expression the expression to detect constant.
     * @return an optional assembly level constant.
     */
    private fun getConstOpt(expression: MidIrExpression): Int? {
        return if (expression is Constant) expression.intValue else null
    }

    /**
     * @param expression the expression to get the constant.
     * @return the constant for mem add-and-multiply.
     */
    private fun getMulConst(expression: MidIrExpression): MultipliedConstant? {
        if (expression !is Constant) return null
        if (expression.value > Int.MAX_VALUE || expression.value < Int.MIN_VALUE) return null
        return when (expression.value.toInt()) {
            1 -> MultipliedConstant.ONE
            2 -> MultipliedConstant.TWO
            4 -> MultipliedConstant.FOUR
            8 -> MultipliedConstant.EIGHT
            else -> null
        }
    }

    /**
     * @param expression the expression to get the multiple of in mem.
     * @param dpTiling the tiling class.
     * @return the multiple of equivalent for this expression.
     */
    private fun getMultipleOf(expression: MidIrExpression, dpTiling: DpTiling): Result<MultipleOf>? {
        if (expression is Temporary) {
            return Result(
                item = MultipleOf(REG(expression.id), MultipliedConstant.ONE),
                instructions = listOf(COMMENT(comment = "multipleOf: $expression"))
            )
        }
        if (expression !is Op) {
            return null
        }
        val (operator, e1, e2) = expression
        // first let's deal with an unconventional case: x = e1 = e2, op = + ==> x * 2
        if (operator === IrOperator.ADD && e1 is Temporary && e2 is Temporary && e1.id == e2.id) {
            return Result(
                item = MultipleOf(baseReg = REG(e1.id), multipliedConstant = MultipliedConstant.TWO),
                instructions = listOf(COMMENT(comment = "multipleOf: $expression"))
            )
        }
        // from this point, op must be mul!
        if (operator !== IrOperator.MUL) {
            return null
        }
        val instructions = mutableListOf<AssemblyInstruction>()
        instructions += COMMENT(comment = "multipleOf: $expression")
        val e2Const = getMulConst(e2) ?: return null
        val (instructions1, reg) = dpTiling.tile(e1)
        instructions += instructions1
        return Result(MultipleOf(baseReg = reg, multipliedConstant = e2Const), instructions)
    }

    private fun getRegWithDisplacement(op: Op, dpTiling: DpTiling): MemTilingResult? {
        val e1 = op.e1
        val e2 = op.e2
        return when (op.operator) {
            IrOperator.ADD -> {
                val e2ConstOpt = getConstOpt(e2)
                if (e2ConstOpt != null) {
                    val (instructions, reg) = dpTiling.tile(e1)
                    return MemTilingResult(instructions = instructions, mem = MEM(reg, CONST(e2ConstOpt)))
                }
                null
            }
            IrOperator.SUB -> if (e2 is Constant) {
                // e2 must ne a constant, not label!
                val e2LongValue = -e2.value
                if (e2LongValue > Int.MAX_VALUE || e2LongValue < Int.MIN_VALUE) {
                    null
                } else {
                    val lowerBits = e2LongValue.toInt()
                    val (instructions, reg) = dpTiling.tile(e1)
                    MemTilingResult(instructions, MEM(reg, CONST(lowerBits)))
                }
            } else {
                null
            }
            else -> null
        }
    }

    private fun getRegWithMultipleOf(op: Op, dpTiling: DpTiling): MemTilingResult? {
        if (op.operator !== IrOperator.ADD) {
            return null
        }
        val e1 = op.e1
        val e2 = op.e2
        val multipleOfE2 = getMultipleOf(e2, dpTiling)
        var result: MemTilingResult? = null
        if (multipleOfE2 != null) {
            val instructions = multipleOfE2.instructions.toMutableList()
            val (instructions1, reg) = dpTiling.tile(e1)
            instructions += instructions1
            result = MemTilingResult(
                    instructions = instructions,
                    mem = MEM(reg, multipleOfE2.item)
            )
        }
        val multipleOfE1 = getMultipleOf(e1, dpTiling)
        if (multipleOfE1 != null) {
            val instructions = multipleOfE1.instructions.toMutableList()
            val (instructions1, reg) = dpTiling.tile(e2)
            instructions += instructions1
            val anotherResult = MemTilingResult(
                    instructions = instructions,
                    mem = MEM(reg, multipleOfE1.item)
            )
            // try to avoid higher cost
            return better(result, anotherResult)
        }
        return result
    }

    private fun getMultipleOfWithDisplacement(op: Op, dpTiling: DpTiling): MemTilingResult? {
        val e1 = op.e1
        val e2 = op.e2
        val multipleOfE1 = getMultipleOf(e1, dpTiling)
        val e2ConstOpt = getConstOpt(e2)
        val instructions = mutableListOf<AssemblyInstruction>()
        instructions += COMMENT(comment = "multiple of with displacement: $op")
        if (multipleOfE1 != null && e2ConstOpt != null) {
            val forSub: Boolean = when (op.operator) {
                IrOperator.ADD -> false
                IrOperator.SUB -> true
                else -> return null
            }
            var constValue: Int = e2ConstOpt
            if (forSub) {
                constValue = -constValue
            }
            instructions += multipleOfE1.instructions
            return MemTilingResult(
                    instructions = instructions,
                    mem = MEM(multipleOfE1.item, CONST(constValue))
            )
        }
        val multipleOfE2 = getMultipleOf(e2, dpTiling)
        val e1ConstOpt = getConstOpt(e1)
        if (multipleOfE2 != null && e1ConstOpt != null) {
            if (op.operator !== IrOperator.ADD) {
                return null
            }
            instructions += multipleOfE2.instructions
            return MemTilingResult(
                    instructions = instructions,
                    mem = MEM(multipleOfE2.item, CONST(e1ConstOpt))
            )
        }
        return null
    }

    private fun getCompleteMem(op: Op, dpTiling: DpTiling): MemTilingResult? {
        val e1 = op.e1
        val e2 = op.e2
        val isAdd: Boolean = when (op.operator) {
            IrOperator.ADD -> true
            IrOperator.SUB -> false
            else -> return null
        }
        // case 1: one side is constant
        val e2ConstOpt = getConstOpt(e2)
        if (e2ConstOpt != null && e1 is Op) {
            var constValue = e2ConstOpt
            if (!isAdd) {
                constValue = -constValue
            }
            val (instructions, mem) = getRegWithMultipleOf(e1, dpTiling) ?: return null
            val (baseReg, multipleOf) = mem
            val newMem = AssemblyArgs.Mem(baseReg, multipleOf, CONST(constValue))
            return MemTilingResult(instructions, newMem)
        }
        if (!isAdd) {
            return null
        }
        // case 2: one side is multiple of
        var potentialOpWithMultipleOf: Op? = null
        var potentialMultipleOf = getMultipleOf(e1, dpTiling)
        if (potentialMultipleOf != null && e2 is Op) {
            potentialOpWithMultipleOf = e2
        } else {
            potentialMultipleOf = getMultipleOf(e2, dpTiling)
            if (potentialMultipleOf != null && e1 is Op) {
                potentialOpWithMultipleOf = e1
            }
        }
        if (potentialOpWithMultipleOf != null) {
            val instructions = mutableListOf<AssemblyInstruction>()
            instructions += COMMENT(comment = "multipleOf + (temp + constant): $op")
            instructions += potentialMultipleOf!!.instructions
            val regWithDisplacement = getRegWithDisplacement(potentialOpWithMultipleOf, dpTiling)
            if (regWithDisplacement != null) {
                instructions += regWithDisplacement.instructions
                val (baseReg, _, displacement) = regWithDisplacement.mem
                val newMem = AssemblyArgs.Mem(
                        baseReg,
                        potentialMultipleOf!!.item,
                        displacement
                )
                return MemTilingResult(instructions, newMem)
            }
        }
        // case 3: one side is reg (i.e. other side is multipleOf + constant)
        var potentialReg: MidIrExpression? = null
        var potentialMultipleOfWithDist = getMultipleOfWithDisplacement(op, dpTiling)
        if (e1 is Op) {
            potentialMultipleOfWithDist = getMultipleOfWithDisplacement(e1, dpTiling)
            if (potentialMultipleOfWithDist != null) {
                potentialReg = e2
            } else if (e2 is Op) {
                potentialMultipleOfWithDist = getMultipleOfWithDisplacement(e2, dpTiling)
                if (potentialMultipleOfWithDist != null) {
                    potentialReg = e1
                }
            }
        }
        if (potentialReg != null) {
            val instructions = mutableListOf<AssemblyInstruction>()
            instructions += COMMENT(comment = "reg + (multipleOf + constant): $op")
            instructions += potentialMultipleOfWithDist!!.instructions
            val (instructions1, reg) = dpTiling.tile(potentialReg)
            instructions += instructions1
            val (_, multipleOf, displacement) = potentialMultipleOfWithDist!!.mem
            val newMem = AssemblyArgs.Mem(baseReg = reg, multipleOf = multipleOf, displacement = displacement)
            return MemTilingResult(instructions, newMem)
        }
        return null
    }

    /**
     * @param expr the expr IR node to tile as a mem expr.
     * @param dpTiling the tiling class.
     * @return the optimally tiled mem node.
     */
    fun tileExprForMem(expr: MidIrExpression, dpTiling: DpTiling): MemTilingResult? =
            expr.accept(visitor = MemExprTilingVisitor, context = dpTiling)

    /**
     * @param mem the mem IR node to tile.
     * @param dpTiling the tiling class.
     * @return the optimally tiled mem node.
     */
    fun tileMem(mem: MidIrExpression.Mem, dpTiling: DpTiling): MemTilingResult {
        val expr = mem.expression
        if (expr is Name) {
            return MemTilingResult(emptyList(), MEM(RIP, NAME(expr.name)))
        }
        val result = tileExprForMem(expr, dpTiling)
        if (result != null) {
            return result
        }
        val (instructions, reg) = dpTiling.tile(expr)
        return MemTilingResult(instructions, MEM(reg))
    }

    data class Result<T>(val item: T, val instructions: List<AssemblyInstruction>)

    /**
     * The visitor that checks we covers every case for mem tiling.
     */
    private object MemExprTilingVisitor : MidIrExpressionVisitor<DpTiling, MemTilingResult?> {
        override fun visit(node: Constant, context: DpTiling): MemTilingResult? {
            // good case 1: only displacement
            val intValue = node.intValue ?: return null
            return MemTilingResult(listOf(COMMENT(comment = "const: $node")), MEM(CONST(intValue)))
        }

        override fun visit(node: Name, context: DpTiling): MemTilingResult =
            // special case: force name with rip
            MemTilingResult(listOf(COMMENT(comment = "force named address with rip: $node")), MEM(RIP, NAME(node.name)))

        override fun visit(node: Temporary, context: DpTiling): MemTilingResult =
            // good case 2: only base reg
            MemTilingResult(listOf(COMMENT(comment = "only base reg: $node")), MEM(REG(node.id)))

        override fun visit(node: Op, context: DpTiling): MemTilingResult? {
            // good case 3: all three components!
            var result = getCompleteMem(node, context)
            val potentialMultipleOf = getMultipleOf(node, context)
            if (potentialMultipleOf != null) { // good case 4: only multiple of
                val newResult = MemTilingResult(
                        instructions = potentialMultipleOf.instructions,
                        mem = MEM_MUL(potentialMultipleOf.item)
                )
                result = better(result, newResult)
            }
            // good case 5: base reg with displacement
            val resultForRegWithDisplacement = getRegWithDisplacement(node, context)
            if (resultForRegWithDisplacement != null) {
                result = better(result, resultForRegWithDisplacement)
            }
            // good case 6: base reg with multiple of
            val resultForRegWithMultipleOf = getRegWithMultipleOf(node, context)
            if (resultForRegWithMultipleOf != null) {
                result = better(result, resultForRegWithMultipleOf)
            }
            // good case 7: multiple of with displacement, or failed
            val resultForMultipleOfWithDisplacement = getMultipleOfWithDisplacement(node, context)
                    ?: return result
            return better(result, resultForMultipleOfWithDisplacement)
        }

        override fun visit(node: MidIrExpression.Mem, context: DpTiling): MemTilingResult? = null
    }
}
