package samlang.ast

/**
 * @property precedence precedence level. Lower the level, higher the precedence.
 */
sealed class Expression(val precedence: Int) : Node {

    abstract val type: Type

    /**
     * Accept the visitor of the given [visitor].
     */
    abstract fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T

    data class Literal(
        override val range: Range,
        override val type: Type,
        val literal: samlang.ast.Literal
    ) : Expression(precedence = 0) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class This(override val range: Range, override val type: Type) : Expression(precedence = 0) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class Variable(
        override val range: Range,
        override val type: Type,
        val name: String
    ) : Expression(precedence = 0) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class ModuleMember(
        override val range: Range,
        override val type: Type,
        val moduleName: String,
        val memberName: String
    ) : Expression(precedence = 0) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class TupleConstructor(
        override val range: Range,
        override val type: Type.TupleType,
        val expressionList: List<Expression>
    ) : Expression(precedence = 1) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class ObjectConstructor(
        override val range: Range,
        override val type: Type,
        val spreadExpression: Expression?,
        val fieldDeclarations: List<FieldConstructor>
    ) : Expression(precedence = 1) {

        sealed class FieldConstructor {

            abstract val range: Range
            abstract val type: Type
            abstract val name: String

            abstract fun copyWithNewType(type: Type): FieldConstructor

            data class Field(
                override val range: Range,
                override val type: Type,
                override val name: String,
                val expression: Expression
            ) : FieldConstructor() {

                override fun copyWithNewType(type: Type): FieldConstructor = copy(type = type)
            }

            data class FieldShorthand(
                override val range: Range,
                override val type: Type,
                override val name: String
            ) : FieldConstructor() {

                override fun copyWithNewType(type: Type): FieldConstructor = copy(type = type)
            }
        }

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class VariantConstructor(
        override val range: Range,
        override val type: Type,
        val tag: String,
        val data: Expression
    ) : Expression(precedence = 1) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class FieldAccess(
        override val range: Range,
        override val type: Type,
        val expression: Expression,
        val fieldName: String
    ) : Expression(precedence = 1) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class MethodAccess(
        override val range: Range,
        override val type: Type,
        val expression: Expression,
        val methodName: String
    ) : Expression(precedence = 2) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class Unary(
        override val range: Range,
        override val type: Type,
        val operator: UnaryOperator,
        val expression: Expression
    ) : Expression(precedence = 3) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class Panic(
        override val range: Range,
        override val type: Type,
        val expression: Expression
    ) : Expression(precedence = 3) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class FunctionApplication(
        override val range: Range,
        override val type: Type,
        val functionExpression: Expression,
        val arguments: List<Expression>
    ) : Expression(precedence = 4) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class Binary(
        override val range: Range,
        override val type: Type,
        val e1: Expression,
        val operator: BinaryOperator,
        val e2: Expression
    ) : Expression(precedence = 5 + operator.precedence) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class IfElse(
        override val range: Range,
        override val type: Type,
        val boolExpression: Expression,
        val e1: Expression,
        val e2: Expression
    ) : Expression(precedence = 10) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class Match(
        override val range: Range,
        override val type: Type,
        val matchedExpression: Expression,
        val matchingList: List<VariantPatternToExpr>
    ) : Expression(precedence = 11) {

        data class VariantPatternToExpr(
            val range: Range,
            val tag: String,
            val dataVariable: String?,
            val expression: Expression
        )

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class Lambda(
        override val range: Range,
        override val type: Type.FunctionType,
        val parameters: List<Pair<String, Type>>,
        val body: Expression
    ) : Expression(precedence = 12) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }

    data class Val(
        override val range: Range,
        override val type: Type,
        val pattern: Pattern,
        val typeAnnotation: Type,
        val assignedExpression: Expression,
        val nextExpression: Expression?
    ) : Expression(precedence = 13) {

        override fun <C, T> accept(visitor: CheckedExprVisitor<C, T>, context: C): T =
            visitor.visit(expression = this, context = context)
    }
}
