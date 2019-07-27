package samlang.compiler.printer

import samlang.ast.lang.ExpressionVisitor
import samlang.ast.lang.ClassDefinition
import samlang.ast.lang.ClassDefinition.TypeDefinitionType.OBJECT
import samlang.ast.lang.ClassDefinition.TypeDefinitionType.VARIANT
import samlang.ast.lang.Expression
import samlang.ast.lang.Expression.Binary
import samlang.ast.lang.Expression.FieldAccess
import samlang.ast.lang.Expression.FunctionApplication
import samlang.ast.lang.Expression.IfElse
import samlang.ast.lang.Expression.Lambda
import samlang.ast.lang.Expression.Literal
import samlang.ast.lang.Expression.Match
import samlang.ast.lang.Expression.MethodAccess
import samlang.ast.lang.Expression.ClassMember
import samlang.ast.lang.Expression.ObjectConstructor
import samlang.ast.lang.Expression.Panic
import samlang.ast.lang.Expression.This
import samlang.ast.lang.Expression.TupleConstructor
import samlang.ast.lang.Expression.Unary
import samlang.ast.lang.Expression.Val
import samlang.ast.lang.Expression.Variable
import samlang.ast.lang.Expression.VariantConstructor
import samlang.ast.lang.Module
import samlang.ast.lang.Pattern
import samlang.util.IndentedPrinter
import java.io.PrintStream

object PrettyPrinter {

    fun prettyPrint(module: Module, printStream: PrintStream) {
        // use 4-space
        val indentedPrinter = IndentedPrinter(printStream = printStream, indentationSymbol = "    ")
        TopLevelPrinter(printer = indentedPrinter).print(module = module)
    }

    private class TopLevelPrinter(private val printer: IndentedPrinter) {

        private val exprPrinter: ExprPrinter = ExprPrinter(printer = printer)

        fun print(module: Module) {
            module.classDefinitions.forEach { classDefinition ->
                print(classDefinition = classDefinition)
                printer.println()
            }
        }

        private fun print(classDefinition: ClassDefinition) {
            val (_, _, name, typeDefinition, members) = classDefinition
            val (_, typeDefinitionType, typeParameters, mappings) = typeDefinition
            val typeParameterString =
                typeParameters?.joinToString(separator = ", ", prefix = "<", postfix = ">") ?: ""
            if (typeDefinition.mappings.isEmpty()) {
                printer.printWithBreak(x = "class $name {")
            } else {
                printer.printWithBreak(x = "class $name$typeParameterString(")
                printer.indented {
                    when (typeDefinitionType) {
                        OBJECT -> mappings.forEach { (field, type) -> printWithBreak(x = "$field: $type,") }
                        VARIANT -> mappings.forEach { (tag, dataType) -> printWithBreak(x = "$tag($dataType),") }
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
            val memberVisibility = if (isPublic) "public " else ""
            val memberType = if (isMethod) "method" else "function"
            val typeParamsString = typeParameters?.joinToString(separator = ", ", prefix = " <", postfix = ">") ?: ""
            val argsString = parameters.joinToString(
                separator = ", ", prefix = "(", postfix = ")"
            ) { (name, _, type, _) -> "$name: $type" }
            val returnTypeString = type.returnType.prettyPrint()
            val header = "$memberVisibility$memberType$typeParamsString $name$argsString: $returnTypeString ="
            printer.printWithBreak(x = header)
            printer.indented { body.accept(visitor = exprPrinter, context = true) }
            printer.println()
        }
    }

    private class ExprPrinter(private val printer: IndentedPrinter) :
        ExpressionVisitor<Boolean, Unit> {

        private fun Expression.printSelf(requireBreak: Boolean, withParenthesis: Boolean = false): Unit =
            if (withParenthesis) {
                printer.printlnWithoutFurtherIndentation {
                    printWithoutBreak(x = "(")
                    printSelf(requireBreak = false)
                    print(x = ")", requireBreak = requireBreak)
                }
            } else accept(visitor = this@ExprPrinter, context = requireBreak)

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
            printer.print(x = "${expression.moduleName}::${expression.memberName}", requireBreak = context)
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
                print(x = "::${expression.methodName}", requireBreak = context)
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
            printer.printlnWithoutFurtherIndentation {
                printWithoutBreak(x = "if (")
                expression.boolExpression.printSelf(requireBreak = false)
                printWithoutBreak(x = ") then (")
            }
            printer.indented { expression.e1.printSelf(requireBreak = true) }
            printer.printWithBreak(x = ") else (")
            printer.indented { expression.e2.printSelf(requireBreak = true) }
            printer.print(x = ")", requireBreak = context)
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

        override fun visit(expression: Val, context: Boolean) {
            printer.printlnWithoutFurtherIndentation {
                val patternString = when (val p = expression.pattern) {
                    is Pattern.TuplePattern -> {
                        p.destructedNames.joinToString(separator = ", ", prefix = "[", postfix = "]") { it ?: "_" }
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
                printWithBreak(x = "val $patternString: ${expression.assignedExpression.type} = (")
            }
            printer.indented { expression.assignedExpression.printSelf(requireBreak = true) }
            val nextExpression = expression.nextExpression
            if (nextExpression == null) {
                printer.print(x = ");", requireBreak = context)
            } else {
                printer.printWithBreak(x = ");")
                nextExpression.printSelf(requireBreak = context)
            }
        }
    }
}
