package samlang.printer

import java.io.PrintStream
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

fun prettyPrint(module: Module, printStream: PrintStream) {
    // use 4-space
    val indentedPrinter = IndentedPrinter(printStream = printStream, indentationSymbol = "    ")
    TopLevelPrinter(printer = indentedPrinter).print(module = module)
}

fun prettyPrint(module: Module): String =
    printToStream { printStream -> prettyPrint(module = module, printStream = printStream) }

private class TopLevelPrinter(private val printer: IndentedPrinter) {
    private val expressionPrinter: ExpressionPrinter = ExpressionPrinter(printer = printer)

    fun print(module: Module) {
        if (module.imports.isNotEmpty()) {
            module.imports.forEach(action = ::printImport)
            printer.println()
        }
        module.classDefinitions.forEach { classDefinition ->
            print(classDefinition = classDefinition)
            printer.println()
        }
    }

    private fun printImport(import: ModuleMembersImport) {
        val importedMemberString = import.importedMembers.joinToString(separator = ", ") { it.first }
        val importedModuleString = import.importedModule.parts.joinToString(separator = ".")
        printer.printWithBreak(x = "import { $importedMemberString } from $importedModuleString")
    }

    private fun print(classDefinition: ClassDefinition) {
        val (_, _, name, typeDefinition, members) = classDefinition
        val (_, typeDefinitionType, typeParameters, names, mappings) = typeDefinition
        if (typeDefinition.mappings.isEmpty()) {
            printer.printWithBreak(x = "class $name {")
        } else {
            printer.printWithBreak(x = "class $name${typeParametersToString(typeParameters = typeParameters)}(")
            printer.indented {
                names.forEach { name ->
                    val fieldType = mappings[name] ?: error(message = "Bad type definition!")
                    when (typeDefinitionType) {
                        OBJECT -> {
                            val (type, isPublic) = fieldType
                            val modifier = if (isPublic) "" else "private "
                            printWithBreak(x = "${modifier}val $name: $type,")
                        }
                        VARIANT -> {
                            printWithBreak(x = "$name(${fieldType.type}),")
                        }
                    }
                }
            }
            printer.printWithBreak(x = ") {")
        }
        printer.indented {
            println()
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
        val header = "$memberVisibility$memberType$typeParameterString $name$argsString: $returnTypeString ="
        if (body is StatementBlockExpression) {
            val block = body.block
            if (block.statements.isEmpty() && block.expression == null) {
                printer.printWithBreak(x = "$header {}")
                printer.println()
                return
            }
            printer.printWithBreak(x = "$header {")
            printer.indented {
                expressionPrinter.printBlock(block = body.block)
            }
            printer.printWithBreak(x = "}")
            printer.println()
            return
        }
        printer.printWithBreak(x = header)
        printer.indented {
            if (body.isComplex) {
                body.accept(visitor = expressionPrinter, context = true)
            } else {
                printlnWithoutFurtherIndentation { body.accept(visitor = expressionPrinter, context = true) }
            }
        }
        printer.println()
    }
}

private class ExpressionPrinter(private val printer: IndentedPrinter) : ExpressionVisitor<Boolean, Unit> {

    private fun Expression.printSelf(withParenthesis: Boolean = false): Unit =
        if (withParenthesis) {
            printer.printWithoutBreak(x = "(")
            printSelf()
            printer.printWithoutBreak(x = ")")
        } else {
            accept(visitor = this@ExpressionPrinter, context = false)
        }

    override fun visit(expression: Literal, context: Boolean): Unit =
        printer.printWithoutBreak(x = expression.literal.prettyPrintedValue)

    override fun visit(expression: This, context: Boolean): Unit = printer.printWithoutBreak(x = "this")

    override fun visit(expression: Variable, context: Boolean): Unit =
        printer.printWithoutBreak(x = expression.name)

    override fun visit(expression: ClassMember, context: Boolean): Unit =
        printer.printWithoutBreak(x = "${expression.className}.${expression.memberName}")

    override fun visit(expression: TupleConstructor, context: Boolean) {
        printer.printWithoutBreak(x = "[")
        expression.expressionList.forEachIndexed { index, e ->
            e.printSelf()
            if (index != expression.expressionList.size - 1) {
                printer.printWithoutBreak(x = ", ")
            }
        }
        printer.printWithoutBreak(x = "]")
    }

    override fun visit(expression: ObjectConstructor, context: Boolean) {
        printer.printWithoutBreak(x = "{ ")
        expression.fieldDeclarations.forEach { constructor ->
            when (constructor) {
                is ObjectConstructor.FieldConstructor.Field -> {
                    printer.printWithoutBreak(x = "${constructor.name}: ")
                    constructor.expression.printSelf()
                }
                is ObjectConstructor.FieldConstructor.FieldShorthand -> {
                    printer.printWithoutBreak(x = constructor.name)
                }
            }
            printer.printWithoutBreak(x = ", ")
        }
        printer.printWithoutBreak(x = "}")
    }

    override fun visit(expression: VariantConstructor, context: Boolean) {
        printer.printWithoutBreak(x = "${expression.tag}(")
        expression.data.printSelf()
        printer.printWithoutBreak(x = ")")
    }

    override fun visit(expression: FieldAccess, context: Boolean) {
        expression.expression.printSelf(
            withParenthesis = expression.expression.precedence >= expression.precedence
        )
        printer.printWithoutBreak(x = ".${expression.fieldName}")
    }

    override fun visit(expression: MethodAccess, context: Boolean) {
        expression.expression.printSelf(
            withParenthesis = expression.expression.precedence >= expression.precedence
        )
        printer.printWithoutBreak(x = ".${expression.methodName}")
    }

    override fun visit(expression: Unary, context: Boolean) {
        printer.printWithoutBreak(x = expression.operator.symbol)
        expression.expression.printSelf(
            withParenthesis = expression.expression.precedence >= expression.precedence
        )
    }

    override fun visit(expression: Panic, context: Boolean) {
        printer.printWithoutBreak(x = "panic(")
        expression.expression.printSelf()
        printer.printWithoutBreak(x = ")")
    }

    override fun visit(expression: BuiltInFunctionCall, context: Boolean) {
        printer.printWithoutBreak(x = "${expression.functionName.displayName}(")
        expression.argumentExpression.printSelf()
        printer.printWithoutBreak(x = ")")
    }

    override fun visit(expression: FunctionApplication, context: Boolean) {
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

    override fun visit(expression: Binary, context: Boolean) {
        expression.e1.printSelf(
            withParenthesis = expression.e1.precedence >= expression.precedence
        )
        printer.printWithoutBreak(x = " ${expression.operator.symbol} ")
        expression.e2.printSelf(
            withParenthesis = expression.e2.precedence >= expression.precedence
        )
    }

    override fun visit(expression: IfElse, context: Boolean) {
        val e1 = expression.e1
        val e2 = expression.e2
        val e1IsBlock = e1 is StatementBlockExpression
        val e2IsBlock = e2 is StatementBlockExpression
        printer.printlnWithoutFurtherIndentation {
            printWithoutBreak(x = "if (")
            expression.boolExpression.printSelf()
            printWithoutBreak(x = ") then ${if (e1IsBlock) "{" else "("}")
        }
        printer.indented {
            if (e1IsBlock) {
                printBlock(block = (e1 as StatementBlockExpression).block)
            } else {
                printlnWithoutFurtherIndentation { e1.printSelf() }
            }
        }
        printer.printWithBreak(x = "${if (e1IsBlock) "}" else ")"} else ${if (e2IsBlock) "{" else "("}")
        printer.indented {
            if (e2IsBlock) {
                printBlock(block = (e2 as StatementBlockExpression).block)
            } else {
                printlnWithoutFurtherIndentation { e2.printSelf() }
            }
        }
        printer.print(x = if (e2IsBlock) "}" else ")", requireBreak = context)
    }

    override fun visit(expression: Match, context: Boolean) {
        printer.printlnWithoutFurtherIndentation {
            printWithoutBreak(x = "match (")
            expression.matchedExpression.printSelf()
            printWithoutBreak(x = ") {")
        }
        printer.indented {
            expression.matchingList.forEach { variantPatternToExpr ->
                printlnWithoutFurtherIndentation {
                    printWithoutBreak(x = "| ${variantPatternToExpr.tag} ")
                    printWithoutBreak(x = variantPatternToExpr.dataVariable ?: "_")
                    printWithoutBreak(x = " -> (")
                }
                indented {
                    printlnWithoutFurtherIndentation { variantPatternToExpr.expression.printSelf() }
                }
                printWithoutBreak(x = ")")
            }
        }
        printer.print(x = "}", requireBreak = context)
    }

    override fun visit(expression: Lambda, context: Boolean) {
        printer.printlnWithoutFurtherIndentation {
            val argsString = expression.parameters.joinToString(
                separator = ", ", prefix = "(", postfix = ")"
            ) { (n, t) -> "$n: $t" }
            printWithoutBreak(x = "$argsString -> (")
        }
        printer.indented { expression.body.printSelf() }
        printer.printlnWithoutFurtherIndentation { printWithoutBreak(x = ")") }
    }

    override fun visit(expression: StatementBlockExpression, context: Boolean) {
        printer.printWithBreak(x = "{")
        printer.indented {
            printBlock(block = expression.block)
        }
        printer.printWithBreak(x = "}")
    }

    fun printBlock(block: StatementBlock) {
        block.statements.forEach { statement ->
            printer.printlnWithoutFurtherIndentation {
                when (statement) {
                    is Statement.Val -> printVal(statement = statement)
                }
            }
        }
        val expression = block.expression
        if (expression != null) {
            printer.printlnWithoutFurtherIndentation { expression.printSelf() }
        }
    }

    private fun printVal(statement: Statement.Val) {
        val patternString = when (val p = statement.pattern) {
            is Pattern.TuplePattern -> {
                p.destructedNames.joinToString(separator = ", ", prefix = "[", postfix = "]") { it.first ?: "_" }
            }
            is Pattern.ObjectPattern -> {
                p.destructedNames.joinToString(separator = ", ", prefix = "{ ", postfix = " }") { (o, _, n, _) ->
                    if (n == null) {
                        o
                    } else {
                        "$o as $n"
                    }
                }
            }
            is Pattern.VariablePattern -> p.name
            is Pattern.WildCardPattern -> "_"
        }
        printer.printWithoutBreak(x = "val $patternString: ${statement.assignedExpression.type} = ")
        statement.assignedExpression.printSelf()
        printer.printWithBreak(x = ";")
    }
}

private val Expression.isComplex: Boolean get() = accept(visitor = ExpressionComplexityEstimator, context = Unit)

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
