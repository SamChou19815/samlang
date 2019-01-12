package samlang.interpreter

import kotlinx.collections.immutable.plus
import samlang.ast.checked.CheckedExpr
import samlang.ast.checked.CheckedExpr.*
import samlang.ast.checked.CheckedExprVisitor
import samlang.ast.checked.CheckedPattern
import samlang.ast.checked.CheckedTypeExpr
import samlang.ast.common.BinaryOperator.*
import samlang.ast.common.Literal.*
import samlang.ast.common.UnaryOperator

internal object ExprInterpreter : CheckedExprVisitor<InterpretationContext, Value> {

    private fun blameTypeChecker(): Nothing = error(message = "Slack type checker!")

    fun eval(expr: CheckedExpr, context: InterpretationContext): Value =
        expr.accept(visitor = ExprInterpreter, context = context)

    override fun visit(expr: Literal, context: InterpretationContext): Value = when (val l = expr.literal) {
        UnitLiteral -> Value.UnitValue
        is IntLiteral -> Value.IntValue(v = l.v)
        is StringLiteral -> Value.StringValue(v = l.v)
        is BoolLiteral -> Value.BoolValue(v = l.v)
    }

    override fun visit(expr: This, context: InterpretationContext): Value =
        context.localValues["this"] ?: blameTypeChecker()

    override fun visit(expr: Variable, context: InterpretationContext): Value =
        context.localValues[expr.name] ?: blameTypeChecker()

    override fun visit(expr: ModuleMember, context: InterpretationContext): Value =
        context.modules[expr.moduleName]?.functions?.get(key = expr.memberName) ?: blameTypeChecker()

    override fun visit(expr: TupleConstructor, context: InterpretationContext): Value.TupleValue =
        Value.TupleValue(tupleContent = expr.exprList.map { eval(expr = it, context = context) })

    override fun visit(expr: ObjectConstructor, context: InterpretationContext): Value.ObjectValue {
        val objectContent = mutableMapOf<String, Value>()
        expr.spreadExpr?.let { e ->
            val obj = eval(expr = e, context = context) as Value.ObjectValue
            objectContent.putAll(from = obj.objectContent)
        }
        expr.fieldDeclarations.forEach { dec ->
            when (dec) {
                is ObjectConstructor.FieldConstructor.Field -> {
                    objectContent[dec.name] = eval(expr = dec.expr, context = context)
                }
                is ObjectConstructor.FieldConstructor.FieldShorthand -> {
                    objectContent[dec.name] = eval(
                        expr = Variable(type = dec.type, name = dec.name),
                        context = context
                    )
                }
            }
        }
        return Value.ObjectValue(objectContent = objectContent)
    }

    override fun visit(expr: VariantConstructor, context: InterpretationContext): Value.VariantValue =
        Value.VariantValue(tag = expr.tag, data = eval(expr = expr.data, context = context))

    override fun visit(expr: FieldAccess, context: InterpretationContext): Value {
        val thisValue = eval(expr = expr.expr, context = context) as Value.ObjectValue
        return thisValue.objectContent[expr.fieldName] ?: blameTypeChecker()
    }

    override fun visit(expr: MethodAccess, context: InterpretationContext): Value.FunctionValue {
        val (id, _) = expr.expr.type as CheckedTypeExpr.IdentifierType
        val thisValue = eval(expr = expr.expr, context = context)
        val methodValue = context.modules[id]?.methods?.get(key = expr.methodName) ?: blameTypeChecker()
        val newCtx = context.copy(localValues = context.localValues.plus(pair = "this" to thisValue))
        methodValue.context = newCtx
        return methodValue
    }

    override fun visit(expr: Unary, context: InterpretationContext): Value {
        val v = eval(expr = expr.expr, context = context)
        return when (expr.operator) {
            UnaryOperator.NEG -> {
                v as Value.IntValue
                Value.IntValue(v = -v.v)
            }
            UnaryOperator.NOT -> {
                v as Value.BoolValue
                Value.BoolValue(v = !v.v)
            }
        }
    }

    override fun visit(expr: Panic, context: InterpretationContext): Nothing =
        throw PanicException(reason = (eval(expr = expr.expr, context = context) as Value.StringValue).v)

    override fun visit(expr: FunApp, context: InterpretationContext): Value {
        val (args, body, ctx) = eval(expr = expr.funExpr, context = context) as Value.FunctionValue
        val argValues = expr.arguments.map { eval(expr = it, context = context) }
        val bodyContext = ctx.copy(localValues = ctx.localValues.plus(pairs = args.zip(argValues)))
        return eval(expr = body, context = bodyContext)
    }

    override fun visit(expr: Binary, context: InterpretationContext): Value {
        val v1 = eval(expr = expr.e1, context = context)
        val v2 = eval(expr = expr.e2, context = context)
        return when (expr.operator) {
            MUL -> {
                v1 as Value.IntValue
                v2 as Value.IntValue
                Value.IntValue(v = v1.v * v2.v)
            }
            DIV -> {
                v1 as Value.IntValue
                v2 as Value.IntValue
                if (v2.v == 0L) {
                    throw PanicException(reason = "Division by zero!")
                }
                Value.IntValue(v = v1.v / v2.v)
            }
            MOD -> {
                v1 as Value.IntValue
                v2 as Value.IntValue
                if (v2.v == 0L) {
                    throw PanicException(reason = "Mod by zero!")
                }
                Value.IntValue(v = v1.v % v2.v)
            }
            PLUS -> {
                v1 as Value.IntValue
                v2 as Value.IntValue
                Value.IntValue(v = v1.v + v2.v)
            }
            MINUS -> {
                v1 as Value.IntValue
                v2 as Value.IntValue
                Value.IntValue(v = v1.v - v2.v)
            }
            LT -> {
                v1 as Value.IntValue
                v2 as Value.IntValue
                Value.BoolValue(v = v1.v < v2.v)
            }
            LE -> {
                v1 as Value.IntValue
                v2 as Value.IntValue
                Value.BoolValue(v = v1.v <= v2.v)
            }
            GT -> {
                v1 as Value.IntValue
                v2 as Value.IntValue
                Value.BoolValue(v = v1.v > v2.v)
            }
            GE -> {
                v1 as Value.IntValue
                v2 as Value.IntValue
                Value.BoolValue(v = v1.v >= v2.v)
            }
            EQ -> {
                if (v1 is Value.FunctionValue || v2 is Value.FunctionValue) {
                    throw PanicException(reason = "Cannot compare functions!")
                }
                Value.BoolValue(v = v1 == v2)
            }
            NE -> {
                if (v1 is Value.FunctionValue || v2 is Value.FunctionValue) {
                    throw PanicException(reason = "Cannot compare functions!")
                }
                Value.BoolValue(v = v1 != v2)
            }
            AND -> {
                v1 as Value.BoolValue
                v2 as Value.BoolValue
                Value.BoolValue(v = v1.v && v2.v)
            }
            OR -> {
                v1 as Value.BoolValue
                v2 as Value.BoolValue
                Value.BoolValue(v = v1.v || v2.v)
            }
        }
    }

    override fun visit(expr: IfElse, context: InterpretationContext): Value = eval(
        expr = if ((eval(expr = expr.boolExpr, context = context) as Value.BoolValue).v) expr.e1 else expr.e2,
        context = context
    )

    override fun visit(expr: Match, context: InterpretationContext): Value {
        val matchedValue = eval(expr = expr.matchedExpr, context = context) as Value.VariantValue
        val matchedPattern = expr.matchingList.find { it.tag == matchedValue.tag } ?: blameTypeChecker()
        val ctx = matchedPattern.dataVariable?.let { variable ->
            context.copy(localValues = context.localValues.plus(pair = variable to matchedValue.data))
        } ?: context
        return eval(expr = matchedPattern.expr, context = ctx)
    }

    override fun visit(expr: Lambda, context: InterpretationContext): Value.FunctionValue = Value.FunctionValue(
        arguments = expr.arguments.map { it.first },
        body = expr.body,
        context = context
    )

    override fun visit(expr: Val, context: InterpretationContext): Value {
        val assignedValue = eval(expr = expr.assignedExpr, context = context)
        if (expr.nextExpr == null) {
            return Value.UnitValue
        }
        val ctx = when (val p = expr.pattern) {
            is CheckedPattern.TuplePattern -> {
                val tupleValues = (assignedValue as Value.TupleValue).tupleContent
                val additionalMappings = p.destructedNames.zip(tupleValues).mapNotNull { (name, value) ->
                    name?.let { it to value }
                }
                context.copy(localValues = context.localValues.plus(pairs = additionalMappings))
            }
            is CheckedPattern.ObjectPattern -> {
                val objectValueMappings = (assignedValue as Value.ObjectValue).objectContent
                val additionalMappings = p.destructedNames.map { (original, renamed) ->
                    val v = objectValueMappings[original] ?: blameTypeChecker()
                    (renamed ?: original) to v
                }
                context.copy(localValues = context.localValues.plus(pairs = additionalMappings))
            }
            is CheckedPattern.VariablePattern -> context.copy(
                localValues = context.localValues.plus(pair = p.name to assignedValue)
            )
            CheckedPattern.WildcardPattern -> context
        }
        return eval(expr = expr.nextExpr, context = ctx)
    }

}
