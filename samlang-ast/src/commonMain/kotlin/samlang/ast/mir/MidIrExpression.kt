package samlang.ast.mir

import samlang.ast.common.IrOperator

/**
 * A collection of all IR expressions.
 *
 * @param classOrder the order of the class.
 */
sealed class MidIrExpression(val classOrder: Int) : Comparable<MidIrExpression> {
    abstract fun <C, T> accept(visitor: MidIrExpressionVisitor<C, T>, context: C): T

    @Canonical
    data class Constant(val value: Long) : MidIrExpression(classOrder = 0) {
        val intValue: Int? = if (value >= Int.MIN_VALUE && value <= Int.MAX_VALUE) {
            value.toInt()
        } else {
            null
        }

        override fun toString(): String = value.toString()

        override fun <C, T> accept(visitor: MidIrExpressionVisitor<C, T>, context: C): T =
            visitor.visit(node = this, context = context)

        override fun compareTo(other: MidIrExpression): Int {
            val c = classOrder.compareTo(other.classOrder)
            if (c != 0) {
                return c
            }
            return value.compareTo(other = (other as Constant).value)
        }
    }

    @Canonical
    data class Name(val name: String) : MidIrExpression(classOrder = 1) {
        override fun toString(): String = name

        override fun <C, T> accept(visitor: MidIrExpressionVisitor<C, T>, context: C): T =
            visitor.visit(node = this, context = context)

        override fun compareTo(other: MidIrExpression): Int {
            val c = classOrder.compareTo(other.classOrder)
            if (c != 0) {
                return c
            }
            return name.compareTo(other = (other as Name).name)
        }
    }

    @Canonical
    data class Temporary(val id: String) : MidIrExpression(classOrder = 2) {
        override fun toString(): String = id

        override fun <C, T> accept(visitor: MidIrExpressionVisitor<C, T>, context: C): T =
            visitor.visit(node = this, context = context)

        override fun compareTo(other: MidIrExpression): Int {
            val c = classOrder.compareTo(other.classOrder)
            if (c != 0) {
                return c
            }
            return id.compareTo(other = (other as Temporary).id)
        }
    }

    @Canonical
    data class Op(
        val operator: IrOperator,
        val e1: MidIrExpression,
        val e2: MidIrExpression
    ) : MidIrExpression(classOrder = 4) {
        override fun toString(): String = "($e1 ${operator.displayName} $e2)"

        override fun <C, T> accept(visitor: MidIrExpressionVisitor<C, T>, context: C): T =
            visitor.visit(node = this, context = context)

        override fun compareTo(other: MidIrExpression): Int {
            var c = classOrder.compareTo(other.classOrder)
            if (c != 0) {
                return c
            }
            val otherOp = other as Op
            c = operator.ordinal.compareTo(otherOp.operator.ordinal)
            if (c != 0) {
                return c
            }
            return signNumber(e1.compareTo(otherOp.e1)) +
                    signNumber(e1.compareTo(otherOp.e2)) +
                    signNumber(e2.compareTo(otherOp.e1)) +
                    signNumber(e2.compareTo(otherOp.e2))
        }

        private fun signNumber(number: Int): Int =
            when {
                number == 0 -> 0
                number > 0 -> 1
                else -> -1
            }
    }

    @Canonical
    data class Mem(val expression: MidIrExpression, val immutable: Boolean) : MidIrExpression(classOrder = 3) {
        override fun toString(): String = "mem[$expression]"

        override fun <C, T> accept(visitor: MidIrExpressionVisitor<C, T>, context: C): T =
            visitor.visit(node = this, context = context)

        override fun compareTo(other: MidIrExpression): Int {
            val c = classOrder.compareTo(other.classOrder)
            if (c != 0) {
                return c
            }
            return expression.compareTo(other = (other as Mem).expression)
        }
    }

    @Suppress(names = ["FunctionName"])
    companion object {
        val ZERO: Constant = Constant(value = 0)
        val ONE: Constant = Constant(value = 1)
        val MINUS_ONE: Constant = Constant(value = -1)
        val EIGHT: Constant = Constant(value = 8)

        fun CONST(value: Long): Constant = Constant(value = value)

        fun TEMP(id: String): Temporary = Temporary(id = id)

        fun OP(op: IrOperator, e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = op, e1 = e1, e2 = e2)

        fun OP_FLEX_ORDER(op: IrOperator, e1: MidIrExpression, e2: MidIrExpression): Op {
            when (op) {
                IrOperator.ADD, IrOperator.MUL,
                IrOperator.EQ, IrOperator.NE -> Unit
                else -> return Op(operator = op, e1 = e1, e2 = e2)
            }
            return if (e1 >= e2) {
                Op(operator = op, e1 = e1, e2 = e2)
            } else {
                Op(operator = op, e1 = e2, e2 = e1)
            }
        }

        fun ADD(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = IrOperator.ADD, e1 = e1, e2 = e2)

        fun SUB(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = IrOperator.SUB, e1 = e1, e2 = e2)

        fun MUL(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = IrOperator.MUL, e1 = e1, e2 = e2)

        fun DIV(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = IrOperator.DIV, e1 = e1, e2 = e2)

        fun MOD(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = IrOperator.MOD, e1 = e1, e2 = e2)

        fun XOR(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = IrOperator.XOR, e1 = e1, e2 = e2)

        fun LT(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = IrOperator.LT, e1 = e1, e2 = e2)

        fun GT(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = IrOperator.GT, e1 = e1, e2 = e2)

        fun LE(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = IrOperator.LE, e1 = e1, e2 = e2)

        fun GE(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = IrOperator.GE, e1 = e1, e2 = e2)

        fun EQ(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = IrOperator.EQ, e1 = e1, e2 = e2)

        fun NE(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(IrOperator.NE, e1, e2)

        fun IMMUTABLE_MEM(expression: MidIrExpression): Mem = Mem(expression = expression, immutable = true)

        fun NAME(name: String): Name = Name(name = name)
    }
}
