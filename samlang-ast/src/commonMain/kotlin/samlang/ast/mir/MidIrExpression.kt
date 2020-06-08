package samlang.ast.mir

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
        val operator: MidIrOperator,
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

    data class Call(
        val functionExpr: MidIrExpression,
        val arguments: List<MidIrExpression>
    ) : MidIrExpression(classOrder = 5) {
        override fun toString(): String = "$functionExpr($arguments)"

        override fun <C, T> accept(visitor: MidIrExpressionVisitor<C, T>, context: C): T =
            visitor.visit(node = this, context = context)

        override fun compareTo(other: MidIrExpression): Int = throw UnsupportedOperationException()
    }

    data class ExprSequence(
        val sequence: MidIrStatement.Sequence,
        val expression: MidIrExpression
    ) : MidIrExpression(classOrder = 6) {
        val statements: List<MidIrStatement> get() = sequence.statements

        override fun toString(): String = "ESEQ($sequence, $expression)"

        override fun <C, T> accept(visitor: MidIrExpressionVisitor<C, T>, context: C): T =
            visitor.visit(node = this, context = context)

        override fun compareTo(other: MidIrExpression): Int = throw UnsupportedOperationException()
    }

    @Suppress(names = ["FunctionName"])
    companion object {
        val ZERO: Constant = Constant(value = 0)
        val ONE: Constant = Constant(value = 1)
        val MINUS_ONE: Constant = Constant(value = -1)
        val EIGHT: Constant = Constant(value = 8)

        fun CONST(value: Long): Constant = Constant(value = value)

        fun TEMP(id: String): Temporary = Temporary(id = id)

        fun OP(op: MidIrOperator, e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = op, e1 = e1, e2 = e2)

        fun OP_FLEX_ORDER(op: MidIrOperator, e1: MidIrExpression, e2: MidIrExpression): Op {
            when (op) {
                MidIrOperator.ADD, MidIrOperator.MUL,
                MidIrOperator.AND, MidIrOperator.OR,
                MidIrOperator.EQ, MidIrOperator.NE -> Unit
                else -> return Op(operator = op, e1 = e1, e2 = e2)
            }
            return if (e1 >= e2) {
                Op(operator = op, e1 = e1, e2 = e2)
            } else {
                Op(operator = op, e1 = e2, e2 = e1)
            }
        }

        fun ADD(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = MidIrOperator.ADD, e1 = e1, e2 = e2)

        fun SUB(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = MidIrOperator.SUB, e1 = e1, e2 = e2)

        fun MUL(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = MidIrOperator.MUL, e1 = e1, e2 = e2)

        fun DIV(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = MidIrOperator.DIV, e1 = e1, e2 = e2)

        fun MOD(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = MidIrOperator.MOD, e1 = e1, e2 = e2)

        fun AND(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = MidIrOperator.AND, e1 = e1, e2 = e2)

        fun OR(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = MidIrOperator.OR, e1 = e1, e2 = e2)

        fun XOR(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = MidIrOperator.XOR, e1 = e1, e2 = e2)

        fun LT(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = MidIrOperator.LT, e1 = e1, e2 = e2)

        fun GT(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = MidIrOperator.GT, e1 = e1, e2 = e2)

        fun LE(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = MidIrOperator.LE, e1 = e1, e2 = e2)

        fun GE(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = MidIrOperator.GE, e1 = e1, e2 = e2)

        fun EQ(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(operator = MidIrOperator.EQ, e1 = e1, e2 = e2)

        fun NE(e1: MidIrExpression, e2: MidIrExpression): Op =
            Op(MidIrOperator.NE, e1, e2)

        fun MEM(expression: MidIrExpression, immutable: Boolean): Mem =
            Mem(expression = expression, immutable = immutable)

        fun IMMUTABLE_MEM(expression: MidIrExpression): Mem = Mem(expression = expression, immutable = true)

        fun ESEQ(statement: MidIrStatement.Sequence, expression: MidIrExpression): ExprSequence =
            ExprSequence(sequence = statement, expression = expression)

        fun NAME(name: String): Name = Name(name = name)

        fun CALL(functionExpr: MidIrExpression, args: List<MidIrExpression>): Call =
            Call(functionExpr = functionExpr, arguments = args)

        fun MALLOC(sizeExpr: MidIrExpression): Call =
            Call(functionExpr = Name(name = MidIrNameEncoder.nameOfMalloc), arguments = listOf(sizeExpr))
    }
}
