package samlang.interpreter

import kotlinx.collections.immutable.plus
import samlang.ast.*
import samlang.ast.BinaryOperator.*
import samlang.ast.CheckedExprVisitor
import samlang.ast.Expression.*
import samlang.ast.Expression.Literal
import samlang.ast.Literal.*

internal object ExpressionInterpreter : CheckedExprVisitor<InterpretationContext, Value> {

    private fun blameTypeChecker(): Nothing = error(message = "Bad type checker!")

    fun eval(expression: Expression, context: InterpretationContext): Value =
        expression.accept(visitor = ExpressionInterpreter, context = context)

    override fun visit(expression: Literal, context: InterpretationContext): Value = when (val l = expression.literal) {
        UnitLiteral -> Value.UnitValue
        is IntLiteral -> Value.IntValue(value = l.value)
        is StringLiteral -> Value.StringValue(value = l.value)
        is BoolLiteral -> Value.BoolValue(value = l.value)
    }

    override fun visit(expression: This, context: InterpretationContext): Value =
        context.localValues["this"] ?: blameTypeChecker()

    override fun visit(expression: Variable, context: InterpretationContext): Value =
        context.localValues[expression.name] ?: blameTypeChecker()

    override fun visit(expression: ModuleMember, context: InterpretationContext): Value =
        context.modules[expression.moduleName]?.functions?.get(key = expression.memberName) ?: blameTypeChecker()

    override fun visit(expression: TupleConstructor, context: InterpretationContext): Value.TupleValue =
        Value.TupleValue(tupleContent = expression.expressionList.map { eval(expression = it, context = context) })

    override fun visit(expression: ObjectConstructor, context: InterpretationContext): Value.ObjectValue {
        val objectContent = mutableMapOf<String, Value>()
        expression.spreadExpression?.let { e ->
            val obj = eval(expression = e, context = context) as Value.ObjectValue
            objectContent.putAll(from = obj.objectContent)
        }
        expression.fieldDeclarations.forEach { declaration ->
            when (declaration) {
                is ObjectConstructor.FieldConstructor.Field -> {
                    objectContent[declaration.name] = eval(expression = declaration.expression, context = context)
                }
                is ObjectConstructor.FieldConstructor.FieldShorthand -> {
                    objectContent[declaration.name] = eval(
                        expression = Variable(
                            range = declaration.range,
                            type = declaration.type,
                            name = declaration.name
                        ),
                        context = context
                    )
                }
            }
        }
        return Value.ObjectValue(objectContent = objectContent)
    }

    override fun visit(expression: VariantConstructor, context: InterpretationContext): Value.VariantValue =
        Value.VariantValue(tag = expression.tag, data = eval(expression = expression.data, context = context))

    override fun visit(expression: FieldAccess, context: InterpretationContext): Value {
        val thisValue = eval(expression = expression.expression, context = context) as Value.ObjectValue
        return thisValue.objectContent[expression.fieldName] ?: blameTypeChecker()
    }

    override fun visit(expression: MethodAccess, context: InterpretationContext): Value.FunctionValue {
        val (id, _) = expression.expression.type as Type.IdentifierType
        val thisValue = eval(expression = expression.expression, context = context)
        val methodValue = context.modules[id]?.methods?.get(key = expression.methodName) ?: blameTypeChecker()
        val newCtx = context.copy(localValues = context.localValues.plus(pair = "this" to thisValue))
        methodValue.context = newCtx
        return methodValue
    }

    override fun visit(expression: Unary, context: InterpretationContext): Value {
        val v = eval(expression = expression.expression, context = context)
        return when (expression.operator) {
            UnaryOperator.NEG -> {
                v as Value.IntValue
                Value.IntValue(value = -v.value)
            }
            UnaryOperator.NOT -> {
                v as Value.BoolValue
                Value.BoolValue(value = !v.value)
            }
        }
    }

    override fun visit(expression: Panic, context: InterpretationContext): Nothing =
        throw PanicException(
            reason = (eval(
                expression = expression.expression,
                context = context
            ) as Value.StringValue).value
        )

    override fun visit(expression: FunctionApplication, context: InterpretationContext): Value {
        val (args, body, ctx) = eval(
            expression = expression.functionExpression,
            context = context
        ) as Value.FunctionValue
        val argValues = expression.arguments.map { eval(expression = it, context = context) }
        val bodyContext = ctx.copy(localValues = ctx.localValues.plus(pairs = args.zip(argValues)))
        return eval(expression = body, context = bodyContext)
    }

    override fun visit(expression: Binary, context: InterpretationContext): Value {
        val v1 = eval(expression = expression.e1, context = context)
        val v2 = eval(expression = expression.e2, context = context)
        return when (expression.operator) {
            MUL -> {
                v1 as Value.IntValue
                v2 as Value.IntValue
                Value.IntValue(value = v1.value * v2.value)
            }
            DIV -> {
                v1 as Value.IntValue
                v2 as Value.IntValue
                if (v2.value == 0L) {
                    throw PanicException(reason = "Division by zero!")
                }
                Value.IntValue(value = v1.value / v2.value)
            }
            MOD -> {
                v1 as Value.IntValue
                v2 as Value.IntValue
                if (v2.value == 0L) {
                    throw PanicException(reason = "Mod by zero!")
                }
                Value.IntValue(value = v1.value % v2.value)
            }
            PLUS -> {
                v1 as Value.IntValue
                v2 as Value.IntValue
                Value.IntValue(value = v1.value + v2.value)
            }
            MINUS -> {
                v1 as Value.IntValue
                v2 as Value.IntValue
                Value.IntValue(value = v1.value - v2.value)
            }
            LT -> {
                v1 as Value.IntValue
                v2 as Value.IntValue
                Value.BoolValue(value = v1.value < v2.value)
            }
            LE -> {
                v1 as Value.IntValue
                v2 as Value.IntValue
                Value.BoolValue(value = v1.value <= v2.value)
            }
            GT -> {
                v1 as Value.IntValue
                v2 as Value.IntValue
                Value.BoolValue(value = v1.value > v2.value)
            }
            GE -> {
                v1 as Value.IntValue
                v2 as Value.IntValue
                Value.BoolValue(value = v1.value >= v2.value)
            }
            EQ -> {
                if (v1 is Value.FunctionValue || v2 is Value.FunctionValue) {
                    throw PanicException(reason = "Cannot compare functions!")
                }
                Value.BoolValue(value = v1 == v2)
            }
            NE -> {
                if (v1 is Value.FunctionValue || v2 is Value.FunctionValue) {
                    throw PanicException(reason = "Cannot compare functions!")
                }
                Value.BoolValue(value = v1 != v2)
            }
            AND -> {
                v1 as Value.BoolValue
                v2 as Value.BoolValue
                Value.BoolValue(value = v1.value && v2.value)
            }
            OR -> {
                v1 as Value.BoolValue
                v2 as Value.BoolValue
                Value.BoolValue(value = v1.value || v2.value)
            }
        }
    }

    override fun visit(expression: IfElse, context: InterpretationContext): Value = eval(
        expression = if ((eval(
                expression = expression.boolExpression,
                context = context
            ) as Value.BoolValue).value
        ) expression.e1 else expression.e2,
        context = context
    )

    override fun visit(expression: Match, context: InterpretationContext): Value {
        val matchedValue = eval(expression = expression.matchedExpression, context = context) as Value.VariantValue
        val matchedPattern = expression.matchingList.find { it.tag == matchedValue.tag } ?: blameTypeChecker()
        val ctx = matchedPattern.dataVariable?.let { variable ->
            context.copy(localValues = context.localValues.plus(pair = variable to matchedValue.data))
        } ?: context
        return eval(expression = matchedPattern.expression, context = ctx)
    }

    override fun visit(expression: Lambda, context: InterpretationContext): Value.FunctionValue = Value.FunctionValue(
        arguments = expression.arguments.map { it.first },
        body = expression.body,
        context = context
    )

    override fun visit(expression: Val, context: InterpretationContext): Value {
        val assignedValue = eval(expression = expression.assignedExpression, context = context)
        if (expression.nextExpression == null) {
            return Value.UnitValue
        }
        val ctx = when (val p = expression.pattern) {
            is Pattern.TuplePattern -> {
                val tupleValues = (assignedValue as Value.TupleValue).tupleContent
                val additionalMappings = p.destructedNames.zip(tupleValues).mapNotNull { (name, value) ->
                    name?.let { it to value }
                }
                context.copy(localValues = context.localValues.plus(pairs = additionalMappings))
            }
            is Pattern.ObjectPattern -> {
                val objectValueMappings = (assignedValue as Value.ObjectValue).objectContent
                val additionalMappings = p.destructedNames.map { (original, renamed) ->
                    val v = objectValueMappings[original] ?: blameTypeChecker()
                    (renamed ?: original) to v
                }
                context.copy(localValues = context.localValues.plus(pairs = additionalMappings))
            }
            is Pattern.VariablePattern -> context.copy(
                localValues = context.localValues.plus(pair = p.name to assignedValue)
            )
            is Pattern.WildCardPattern -> context
        }
        return eval(expression = expression.nextExpression, context = ctx)
    }
}
