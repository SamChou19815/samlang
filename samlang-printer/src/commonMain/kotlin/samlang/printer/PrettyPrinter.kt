package samlang.printer

import samlang.ast.common.ModuleMembersImport
import samlang.ast.common.TypeDefinitionType.OBJECT
import samlang.ast.common.TypeDefinitionType.VARIANT
import samlang.ast.lang.ClassDefinition
import samlang.ast.lang.Expression
import samlang.ast.lang.Expression.Binary
import samlang.ast.lang.Expression.BuiltInFunctionCall
import samlang.ast.lang.Expression.ClassMember
import samlang.ast.lang.Expression.FieldAccess
import samlang.ast.lang.Expression.FunctionApplication
import samlang.ast.lang.Expression.IfElse
import samlang.ast.lang.Expression.Lambda
import samlang.ast.lang.Expression.Literal
import samlang.ast.lang.Expression.Match
import samlang.ast.lang.Expression.MethodAccess
import samlang.ast.lang.Expression.ObjectConstructor
import samlang.ast.lang.Expression.Panic
import samlang.ast.lang.Expression.StatementBlockExpression
import samlang.ast.lang.Expression.This
import samlang.ast.lang.Expression.TupleConstructor
import samlang.ast.lang.Expression.Unary
import samlang.ast.lang.Expression.Variable
import samlang.ast.lang.Expression.VariantConstructor
import samlang.ast.lang.ExpressionVisitor
import samlang.ast.lang.Module
import samlang.ast.lang.Pattern
import samlang.ast.lang.Statement
import samlang.ast.lang.StatementBlock
import samlang.util.IndentedPrinter
import samlang.util.PrintDevice

fun prettyPrint(module: Module, device: PrintDevice) {
    // use 4-space
    val indentedPrinter = IndentedPrinter(device = device, indentationSymbol = "    ")
    TopLevelPrinter(printer = indentedPrinter).print(module = module)
}

fun prettyPrint(module: Module): String =
    printToDevice { device -> prettyPrint(module = module, device = device) }

private class TopLevelPrinter(private val printer: IndentedPrinter) {
    private val expressionPrinter: ExpressionPrinter = ExpressionPrinter(printer = printer)

    fun print(module: Module) {
        if (module.imports.isNotEmpty()) {
            module.imports.forEach(action = ::printImport)
            printer.printWithBreak(x = "")
        }
        module.classDefinitions.forEach { classDefinition ->
            print(classDefinition = classDefinition)
            printer.printWithBreak(x = "")
        }
    }

    private fun printImport(import: ModuleMembersImport) {
        val importedMemberString = import.importedMembers.joinToString(separator = ", ") { it.first }
        val importedModuleString = import.importedModule.parts.joinToString(separator = ".")
        printer.printWithBreak(x = "import { $importedMemberString } from $importedModuleString")
    }

    private fun print(classDefinition: ClassDefinition) {
        val (_, _, name, isClassPublic, typeDefinition, members) = classDefinition
        val (_, typeDefinitionType, typeParameters, names, mappings) = typeDefinition
        val privateHeader = if (isClassPublic) "" else "private "
        if (typeDefinition.mappings.isEmpty()) {
            printer.printWithBreak(x = "${privateHeader}class $name {")
        } else {
            val typeParametersString = typeParametersToString(typeParameters = typeParameters)
            printer.printWithBreak(x = "${privateHeader}class $name$typeParametersString(")
            printer.indented {
                names.forEach { name ->
                    val fieldType = mappings[name] ?: error(message = "Bad type definition!")
                    when (typeDefinitionType) {
                        OBJECT -> {
                            val (type, isPublic) = fieldType
                            val modifier = if (isPublic) "" else "private "
                            printWithBreak(x = "${modifier}val $name: $type,")
                        }
                        VARIANT -> printWithBreak(x = "$name(${fieldType.type}),")
                    }
                }
            }
            printer.printWithBreak(x = ") {")
        }
        printer.indented {
            members.forEach { printMember(member = it) }
        }
        printer.printWithBreak(x = "}")
    }

    private fun printMember(member: ClassDefinition.MemberDefinition) {
        val (_, isPublic, isMethod, _, name, typeParameters, type, parameters, body) = member
        val memberVisibility = if (isPublic) "" else "private "
        val memberType = if (isMethod) "method" else "function"
        val typeParameterString = typeParametersToString(typeParameters = typeParameters)
        val argsString = parameters.joinToString(separator = ", ", prefix = "(", postfix = ")") { (name, _, type, _) ->
            "$name: $type"
        }
        val returnTypeString = type.returnType.prettyPrint()
        val header = "$memberVisibility$memberType$typeParameterString $name$argsString: $returnTypeString = "
        expressionPrinter.printAfterExistingLine(header = header, footer = "", expression = body)
    }
}

private class ExpressionPrinter(private val printer: IndentedPrinter) : ExpressionVisitor<Unit, Unit> {
    fun printAfterExistingLine(header: String, footer: String, expression: Expression) {
        if (expression is StatementBlockExpression) {
            val block = expression.block
            if (block.statements.isEmpty() && block.expression == null) {
                printer.printWithBreak(x = "$header{}$footer")
                return
            }
            printer.printWithBreak(x = "$header{")
            printer.indented { printBlock(block = block) }
            printer.printWithBreak(x = "}$footer")
            return
        }
        if (expression.isShort) {
            printer.printInline {
                printer.printWithoutBreak(x = header)
                flexiblePrint(expression = expression)
                printer.printWithBreak(x = footer)
            }
        } else {
            printer.printWithBreak(x = header)
            printer.indented { flexiblePrint(expression = expression) }
            printer.printWithBreak(x = footer)
        }
    }

    /**
     * Print an [expression] correctly regardless of whether it's simple or complex.
     * If it is complex, we directly print it.
     * If it is simple, we print it within a new line.
     */
    private fun flexiblePrint(expression: Expression) {
        if (expression.isComplex) {
            expression.accept(visitor = this, context = Unit)
        } else {
            printer.printInline {
                expression.accept(visitor = this@ExpressionPrinter, context = Unit)
            }
        }
    }

    private fun Expression.printSelf(withParenthesis: Boolean = false): Unit =
        if (withParenthesis) {
            printer.printWithoutBreak(x = "(")
            printSelf()
            printer.printWithoutBreak(x = ")")
        } else {
            accept(visitor = this@ExpressionPrinter, context = Unit)
        }

    override fun visit(expression: Literal, context: Unit): Unit =
        printer.printWithoutBreak(x = expression.literal.prettyPrintedValue)

    override fun visit(expression: This, context: Unit): Unit = printer.printWithoutBreak(x = "this")

    override fun visit(expression: Variable, context: Unit): Unit =
        printer.printWithoutBreak(x = expression.name)

    override fun visit(expression: ClassMember, context: Unit): Unit =
        printer.printWithoutBreak(x = "${expression.className}.${expression.memberName}")

    override fun visit(expression: TupleConstructor, context: Unit) {
        printer.printWithoutBreak(x = "[")
        expression.expressionList.forEachIndexed { index, e ->
            e.printSelf()
            if (index != expression.expressionList.size - 1) {
                printer.printWithoutBreak(x = ", ")
            }
        }
        printer.printWithoutBreak(x = "]")
    }

    override fun visit(expression: ObjectConstructor, context: Unit) {
        printer.printWithoutBreak(x = "{ ")
        expression.fieldDeclarations.forEachIndexed { index, constructor ->
            when (constructor) {
                is ObjectConstructor.FieldConstructor.Field -> {
                    printer.printWithoutBreak(x = "${constructor.name}: ")
                    constructor.expression.printSelf()
                }
                is ObjectConstructor.FieldConstructor.FieldShorthand -> {
                    printer.printWithoutBreak(x = constructor.name)
                }
            }
            if (index != expression.fieldDeclarations.size - 1) {
                printer.printWithoutBreak(x = ", ")
            }
        }
        printer.printWithoutBreak(x = " }")
    }

    override fun visit(expression: VariantConstructor, context: Unit) {
        printer.printWithoutBreak(x = "${expression.tag}(")
        expression.data.printSelf()
        printer.printWithoutBreak(x = ")")
    }

    override fun visit(expression: FieldAccess, context: Unit) {
        expression.expression.printSelf(withParenthesis = expression.expression.precedence >= expression.precedence)
        printer.printWithoutBreak(x = ".${expression.fieldName}")
    }

    override fun visit(expression: MethodAccess, context: Unit) {
        expression.expression.printSelf(withParenthesis = expression.expression.precedence >= expression.precedence)
        printer.printWithoutBreak(x = ".${expression.methodName}")
    }

    override fun visit(expression: Unary, context: Unit) {
        printer.printWithoutBreak(x = expression.operator.symbol)
        expression.expression.printSelf(withParenthesis = expression.expression.precedence >= expression.precedence)
    }

    override fun visit(expression: Panic, context: Unit) {
        printer.printWithoutBreak(x = "panic(")
        expression.expression.printSelf()
        printer.printWithoutBreak(x = ")")
    }

    override fun visit(expression: BuiltInFunctionCall, context: Unit) {
        printer.printWithoutBreak(x = "${expression.functionName.displayName}(")
        expression.argumentExpression.printSelf()
        printer.printWithoutBreak(x = ")")
    }

    override fun visit(expression: FunctionApplication, context: Unit) {
        expression.functionExpression.printSelf(
            withParenthesis = expression.functionExpression.precedence >= expression.precedence
        )
        printer.printWithoutBreak(x = "(")
        expression.arguments.forEachIndexed { index, e ->
            e.printSelf()
            if (index != expression.arguments.size - 1) {
                printer.printWithoutBreak(x = ", ")
            }
        }
        printer.printWithoutBreak(x = ")")
    }

    override fun visit(expression: Binary, context: Unit) {
        expression.e1.printSelf(
            withParenthesis = expression.e1.precedence >= expression.precedence
        )
        printer.printWithoutBreak(x = " ${expression.operator.symbol} ")
        expression.e2.printSelf(
            withParenthesis = expression.e2.precedence >= expression.precedence
        )
    }

    override fun visit(expression: IfElse, context: Unit) {
        val e1 = expression.e1
        val e2 = expression.e2
        val e1IsBlock = e1 is StatementBlockExpression
        val e2IsBlock = e2 is StatementBlockExpression
        printer.printInline {
            printWithoutBreak(x = "if (")
            expression.boolExpression.printSelf()
            printWithoutBreak(x = ") then ${if (e1IsBlock) "{" else "("}")
        }
        printer.indented {
            if (e1IsBlock) {
                printBlock(block = (e1 as StatementBlockExpression).block)
            } else {
                flexiblePrint(expression = e1)
            }
        }
        printer.printWithBreak(x = "${if (e1IsBlock) "}" else ")"} else ${if (e2IsBlock) "{" else "("}")
        printer.indented {
            if (e2IsBlock) {
                printBlock(block = (e2 as StatementBlockExpression).block)
            } else {
                flexiblePrint(expression = e2)
            }
        }
        printer.printWithBreak(x = if (e2IsBlock) "}" else ")")
    }

    override fun visit(expression: Match, context: Unit) {
        printer.printInline {
            printWithoutBreak(x = "match (")
            expression.matchedExpression.printSelf()
            printWithoutBreak(x = ") {")
        }
        printer.indented {
            expression.matchingList.forEach { variantPatternToExpr ->
                val afterMatchExpression = variantPatternToExpr.expression
                val isComplex = afterMatchExpression.isComplex
                printInline {
                    printWithoutBreak(x = "| ${variantPatternToExpr.tag} ")
                    printWithoutBreak(x = variantPatternToExpr.dataVariable ?: "_")
                    if (isComplex) {
                        printWithoutBreak(x = " -> (")
                    } else {
                        printWithoutBreak(x = " -> (")
                        afterMatchExpression.printSelf()
                        printWithoutBreak(x = ")")
                    }
                }
                if (isComplex) {
                    indented { afterMatchExpression.printSelf() }
                    printWithBreak(x = ")")
                }
            }
        }
        printer.printWithBreak(x = "}")
    }

    override fun visit(expression: Lambda, context: Unit) {
        printer.printInline {
            val argsString = expression.parameters.joinToString(
                separator = ", ", prefix = "(", postfix = ")"
            ) { (n, t) -> "$n: $t" }
            printWithoutBreak(x = "$argsString -> (")
        }
        printer.indented {
            flexiblePrint(expression = expression.body)
        }
        printer.printWithBreak(x = ")")
    }

    override fun visit(expression: StatementBlockExpression, context: Unit) {
        printer.printWithBreak(x = "{")
        printer.indented {
            printBlock(block = expression.block)
        }
        printer.printWithBreak(x = "}")
    }

    fun printBlock(block: StatementBlock) {
        block.statements.forEach { statement ->
            printer.printInline {
                when (statement) {
                    is Statement.Val -> printVal(statement = statement)
                }
            }
        }
        block.expression?.let { flexiblePrint(expression = it) }
    }

    private fun printVal(statement: Statement.Val) {
        val patternString = when (val p = statement.pattern) {
            is Pattern.TuplePattern -> {
                p.destructedNames.joinToString(separator = ", ", prefix = "[", postfix = "]") { it.first ?: "_" }
            }
            is Pattern.ObjectPattern -> {
                p.destructedNames.joinToString(separator = ", ", prefix = "{ ", postfix = " }") { (o, _, n, _) ->
                    if (n == null) o else "$o as $n"
                }
            }
            is Pattern.VariablePattern -> p.name
            is Pattern.WildCardPattern -> "_"
        }
        val valHeader = "val $patternString: ${statement.assignedExpression.type} = "
        printAfterExistingLine(header = valHeader, footer = ";", expression = statement.assignedExpression)
    }
}

private val Expression.isShort: Boolean get() = accept(visitor = ExpressionShortnessEstimator, context = Unit)
private val Expression.isComplex: Boolean get() = accept(visitor = ExpressionComplexityEstimator, context = Unit)

private object ExpressionShortnessEstimator : ExpressionVisitor<Unit, Boolean> {
    override fun visit(expression: Literal, context: Unit): Boolean = true
    override fun visit(expression: This, context: Unit): Boolean = true
    override fun visit(expression: Variable, context: Unit): Boolean = true
    override fun visit(expression: ClassMember, context: Unit): Boolean = true
    override fun visit(expression: TupleConstructor, context: Unit): Boolean = true
    override fun visit(expression: ObjectConstructor, context: Unit): Boolean = false
    override fun visit(expression: VariantConstructor, context: Unit): Boolean = true
    override fun visit(expression: FieldAccess, context: Unit): Boolean = true
    override fun visit(expression: MethodAccess, context: Unit): Boolean = true
    override fun visit(expression: Unary, context: Unit): Boolean = expression.expression.isShort
    override fun visit(expression: Panic, context: Unit): Boolean = false
    override fun visit(expression: BuiltInFunctionCall, context: Unit): Boolean = true

    override fun visit(expression: FunctionApplication, context: Unit): Boolean =
        (expression.arguments.isEmpty() || expression.arguments.size == 1 && expression.arguments[0].isShort) &&
                expression.functionExpression.isShort

    override fun visit(expression: Binary, context: Unit): Boolean = expression.e1.isShort && expression.e2.isShort
    override fun visit(expression: IfElse, context: Unit): Boolean = false
    override fun visit(expression: Match, context: Unit): Boolean = false
    override fun visit(expression: Lambda, context: Unit): Boolean = false
    override fun visit(expression: StatementBlockExpression, context: Unit): Boolean = false
}

/** statements are complex -> true, simple expressions are not complex -> false. */
private object ExpressionComplexityEstimator : ExpressionVisitor<Unit, Boolean> {
    override fun visit(expression: Literal, context: Unit): Boolean = false
    override fun visit(expression: This, context: Unit): Boolean = false
    override fun visit(expression: Variable, context: Unit): Boolean = false
    override fun visit(expression: ClassMember, context: Unit): Boolean = false
    override fun visit(expression: TupleConstructor, context: Unit): Boolean = false
    override fun visit(expression: ObjectConstructor, context: Unit): Boolean = false
    override fun visit(expression: VariantConstructor, context: Unit): Boolean = false
    override fun visit(expression: FieldAccess, context: Unit): Boolean = false
    override fun visit(expression: MethodAccess, context: Unit): Boolean = false
    override fun visit(expression: Unary, context: Unit): Boolean = false
    override fun visit(expression: Panic, context: Unit): Boolean = false
    override fun visit(expression: BuiltInFunctionCall, context: Unit): Boolean = false
    override fun visit(expression: FunctionApplication, context: Unit): Boolean = false
    override fun visit(expression: Binary, context: Unit): Boolean = false
    override fun visit(expression: IfElse, context: Unit): Boolean = true
    override fun visit(expression: Match, context: Unit): Boolean = true
    override fun visit(expression: Lambda, context: Unit): Boolean = true
    override fun visit(expression: StatementBlockExpression, context: Unit): Boolean = true
}
