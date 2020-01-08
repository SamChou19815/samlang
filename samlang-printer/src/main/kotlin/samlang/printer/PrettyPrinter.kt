package samlang.printer

import java.io.PrintStream
import samlang.ast.common.ModuleMembersImport
import samlang.ast.common.TypeDefinitionType.OBJECT
import samlang.ast.common.TypeDefinitionType.VARIANT
import samlang.ast.lang.ClassDefinition
import samlang.ast.lang.Expression
import samlang.ast.lang.Expression.Binary
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

    private val expressionPrinter: ExpressionPrinter =
        ExpressionPrinter(printer = printer)

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
        val (_, typeDefinitionType, typeParameters, mappings) = typeDefinition
        if (typeDefinition.mappings.isEmpty()) {
            printer.printWithBreak(x = "class $name {")
        } else {
            printer.printWithBreak(x = "class $name${typeParametersToString(typeParameters = typeParameters)}(")
            printer.indented {
                when (typeDefinitionType) {
                    OBJECT -> mappings.forEach { (field, fieldType) ->
                        val (type, isPublic) = fieldType
                        val modifier = if (isPublic) "" else "private "
                        printWithBreak(x = "${modifier}val $field: $type,")
                    }
                    VARIANT -> mappings.forEach { (tag, fieldType) ->
                        printWithBreak(x = "$tag(${fieldType.type}),")
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
        val argsString = parameters.joinToString(
            separator = ", ", prefix = "(", postfix = ")"
        ) { (name, _, type, _) -> "$name: $type" }
        val returnTypeString = type.returnType.prettyPrint()
        val header = "$memberVisibility$memberType$typeParameterString $name$argsString: $returnTypeString ="
        printer.printWithBreak(x = header)
        printer.indented { body.accept(visitor = expressionPrinter, context = true) }
        printer.println()
    }
}

private class ExpressionPrinter(private val printer: IndentedPrinter) :
    ExpressionVisitor<Boolean, Unit> {

    private fun Expression.printSelf(requireBreak: Boolean, withParenthesis: Boolean = false): Unit =
        if (withParenthesis) {
            printer.printlnWithoutFurtherIndentation {
                printWithoutBreak(x = "(")
                printSelf(requireBreak = false)
                print(x = ")", requireBreak = requireBreak)
            }
        } else accept(visitor = this@ExpressionPrinter, context = requireBreak)

    override fun visit(expression: Literal, context: Boolean) {
        printer.print(x = expression.literal.prettyPrintedValue, requireBreak = context)
    }

    override fun visit(expression: This, context: Boolean) {
        printer.print(x = "this", requireBreak = context)
    }

    override fun visit(expression: Variable, context: Boolean) {
        printer.print(x = expression.name, requireBreak = context)
    }

    override fun visit(expression: ClassMember, context: Boolean) {
        printer.print(x = "${expression.className}.${expression.memberName}", requireBreak = context)
    }

    override fun visit(expression: TupleConstructor, context: Boolean) {
        printer.printlnWithoutFurtherIndentation {
            printWithoutBreak(x = "[")
            expression.expressionList.forEachIndexed { index, e ->
                e.printSelf(requireBreak = false)
                if (index != expression.expressionList.size - 1) {
                    printWithBreak(x = ",")
                }
            }
            print(x = "]", requireBreak = context)
        }
    }

    override fun visit(expression: ObjectConstructor, context: Boolean) {
        printer.printWithBreak(x = "{")
        printer.indented {
            val spreadExpression = expression.spreadExpression
            if (spreadExpression != null) {
                printlnWithoutFurtherIndentation {
                    printWithoutBreak(x = "...")
                    spreadExpression.printSelf(requireBreak = false)
                    printWithBreak(x = ",")
                }
            }
            expression.fieldDeclarations.forEach { constructor ->
                printlnWithoutFurtherIndentation {
                    when (constructor) {
                        is ObjectConstructor.FieldConstructor.Field -> {
                            printWithBreak(x = "${constructor.name}:")
                            constructor.expression.printSelf(requireBreak = false)
                        }
                        is ObjectConstructor.FieldConstructor.FieldShorthand -> {
                            printWithoutBreak(x = constructor.name)
                        }
                    }
                    printWithBreak(x = ",")
                }
            }
        }
        printer.print(x = "}", requireBreak = context)
    }

    override fun visit(expression: VariantConstructor, context: Boolean) {
        printer.printlnWithoutFurtherIndentation {
            printWithoutBreak(x = "${expression.tag}(")
            expression.data.printSelf(requireBreak = false)
            print(x = ")", requireBreak = context)
        }
    }

    override fun visit(expression: FieldAccess, context: Boolean) {
        printer.printlnWithoutFurtherIndentation {
            expression.expression.printSelf(
                requireBreak = false,
                withParenthesis = expression.expression.precedence >= expression.precedence
            )
            print(x = ".${expression.fieldName}", requireBreak = context)
        }
    }

    override fun visit(expression: MethodAccess, context: Boolean) {
        printer.printlnWithoutFurtherIndentation {
            expression.expression.printSelf(
                requireBreak = false,
                withParenthesis = expression.expression.precedence >= expression.precedence
            )
            print(x = ".${expression.methodName}", requireBreak = context)
        }
    }

    override fun visit(expression: Unary, context: Boolean) {
        printer.printlnWithoutFurtherIndentation {
            printWithoutBreak(x = expression.operator.symbol)
            expression.expression.printSelf(
                requireBreak = context,
                withParenthesis = expression.expression.precedence >= expression.precedence
            )
        }
    }

    override fun visit(expression: Panic, context: Boolean) {
        printer.printlnWithoutFurtherIndentation {
            printWithoutBreak(x = "panic(")
            expression.expression.printSelf(requireBreak = false)
            print(x = ")", requireBreak = context)
        }
    }

    override fun visit(expression: FunctionApplication, context: Boolean) {
        printer.printlnWithoutFurtherIndentation {
            expression.functionExpression.printSelf(
                requireBreak = false,
                withParenthesis = expression.functionExpression.precedence >= expression.precedence
            )
            printWithoutBreak(x = "(")
            expression.arguments.forEachIndexed { index, e ->
                e.printSelf(requireBreak = false)
                if (index != expression.arguments.size - 1) {
                    printWithBreak(x = ",")
                }
            }
            print(x = ")", requireBreak = context)
        }
    }

    override fun visit(expression: Binary, context: Boolean) {
        printer.printlnWithoutFurtherIndentation {
            expression.e1.printSelf(
                requireBreak = true,
                withParenthesis = expression.e1.precedence >= expression.precedence
            )
            printWithBreak(x = expression.operator.symbol)
            expression.e2.printSelf(
                requireBreak = context,
                withParenthesis = expression.e2.precedence >= expression.precedence
            )
        }
    }

    override fun visit(expression: IfElse, context: Boolean) {
        val e1 = expression.e1
        val e2 = expression.e2
        val e1IsBlock = e1 is StatementBlockExpression
        val e2IsBlock = e2 is StatementBlockExpression
        printer.printlnWithoutFurtherIndentation {
            printWithoutBreak(x = "if (")
            expression.boolExpression.printSelf(requireBreak = false)
            printWithoutBreak(x = ") then ${if (e1IsBlock) "{" else "("}")
        }
        printer.indented {
            if (e1IsBlock) {
                printBlock(block = (e1 as StatementBlockExpression).block)
            } else {
                e1.printSelf(requireBreak = true)
            }
        }
        printer.printWithBreak(x = "${if (e1IsBlock) "}" else ")"} else ${if (e2IsBlock) "{" else "("}")
        printer.indented {
            if (e2IsBlock) {
                printBlock(block = (e2 as StatementBlockExpression).block)
            } else {
                e2.printSelf(requireBreak = true)
            }
        }
        printer.print(x = if (e2IsBlock) "}" else ")", requireBreak = context)
    }

    override fun visit(expression: Match, context: Boolean) {
        printer.printlnWithoutFurtherIndentation {
            printWithoutBreak(x = "match (")
            expression.matchedExpression.printSelf(requireBreak = false)
            printWithBreak(x = ") {")
        }
        printer.indented {
            expression.matchingList.forEach { variantPatternToExpr ->
                printlnWithoutFurtherIndentation {
                    printWithBreak(x = "| ${variantPatternToExpr.tag}")
                    printWithBreak(x = variantPatternToExpr.dataVariable ?: "_")
                    printWithBreak(x = "-> (")
                }
                indented { variantPatternToExpr.expression.printSelf(requireBreak = true) }
                printWithBreak(x = ")")
            }
        }
        printer.print(x = "}", requireBreak = context)
    }

    override fun visit(expression: Lambda, context: Boolean) {
        printer.printlnWithoutFurtherIndentation {
            val argsString = expression.parameters.joinToString(
                separator = ", ", prefix = "(", postfix = ")"
            ) { (n, t) -> "$n: $t" }
            printWithBreak(x = "$argsString -> (")
        }
        printer.indented { expression.body.printSelf(requireBreak = true) }
        printer.print(x = ")", requireBreak = context)
    }

    override fun visit(expression: StatementBlockExpression, context: Boolean) {
        printer.printWithBreak(x = "{")
        printer.indented {
            printBlock(block = expression.block)
        }
        printer.printWithBreak(x = "}")
    }

    private fun printBlock(block: StatementBlock) {
        block.statements.forEach { statement ->
            printer.printlnWithoutFurtherIndentation {
                when (statement) {
                    is Statement.Val -> printVal(statement = statement)
                }
            }
        }
        val expression = block.expression
        if (expression != null) {
            printer.printlnWithoutFurtherIndentation { expression.printSelf(requireBreak = false) }
        }
    }

    private fun printVal(statement: Statement.Val) {
        val patternString = when (val p = statement.pattern) {
            is Pattern.TuplePattern -> {
                p.destructedNames.joinToString(separator = ", ", prefix = "[", postfix = "]") { it.first ?: "_" }
            }
            is Pattern.ObjectPattern -> {
                p.destructedNames.joinToString(separator = ", ", prefix = "{ ", postfix = " }") { (o, n) ->
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
        statement.assignedExpression.printSelf(requireBreak = false)
        printer.printWithBreak(x = ";")
    }
}
