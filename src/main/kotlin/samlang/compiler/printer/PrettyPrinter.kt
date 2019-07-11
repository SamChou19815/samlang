package samlang.compiler.printer

import samlang.ast.*
import samlang.ast.CheckedExprVisitor
import samlang.ast.Expression.*
import samlang.ast.Expression.Literal
import samlang.util.IndentedPrinter
import java.io.PrintStream

object PrettyPrinter {

    fun prettyPrint(program: Program, printStream: PrintStream) {
        // use 4-space
        val indentedPrinter = IndentedPrinter(printStream = printStream, indentationSymbol = "    ")
        TopLevelPrinter(printer = indentedPrinter).print(program = program)
    }

    private class TopLevelPrinter(private val printer: IndentedPrinter) {

        private val exprPrinter: ExprPrinter = ExprPrinter(printer = printer)

        fun print(program: Program) {
            program.modules.forEach { module ->
                print(module = module)
                printer.println()
            }
        }

        private fun print(module: Module) {
            val (_, _, name, typeDefinition, members) = module
            if (typeDefinition == null) {
                printer.printWithBreak(x = "util $name {")
                printer.indented {
                    println()
                    members.forEach { printMember(member = it) }
                }
                printer.printWithBreak(x = "}")
            } else {
                val typeParamString = typeDefinition.typeParameters
                    ?.joinToString(separator = ", ", prefix = "<", postfix = ">")
                    ?: ""
                printer.printWithBreak(x = "class $name$typeParamString(")
                printer.indented {
                    when (typeDefinition) {
                        is Module.TypeDefinition.ObjectType -> {
                            typeDefinition.mappings.forEach { (field, type) ->
                                printWithBreak(x = "$field: $type,")
                            }
                        }
                        is Module.TypeDefinition.VariantType -> {
                            typeDefinition.mappings.forEach { (tag, dataType) ->
                                printWithBreak(x = "$tag($dataType),")
                            }
                        }
                    }
                }
                printer.printWithBreak(x = ") {")
                printer.indented {
                    println()
                    members.forEach { printMember(member = it) }
                }
                printer.printWithBreak(x = "}")
            }
        }

        private fun printMember(member: Module.MemberDefinition) {
            val (_, isPublic, isMethod, name, type, value) = member
            val memberVisibility = if (isPublic) "public " else ""
            val memberType = if (isMethod) "method" else "function"
            val (typeParams, _) = type
            val typeParamsString = typeParams?.joinToString(separator = ", ", prefix = " <", postfix = ">") ?: ""
            val argsString = value.arguments.joinToString(
                separator = ", ", prefix = "(", postfix = ")"
            ) { (n, t) -> "$n: $t" }
            val returnTypeString = member.type.second.returnType.prettyPrint()
            val header = "$memberVisibility$memberType$typeParamsString $name$argsString: $returnTypeString ="
            printer.printWithBreak(x = header)
            printer.indented { value.body.accept(visitor = exprPrinter, context = true) }
            printer.println()
        }
    }

    private class ExprPrinter(private val printer: IndentedPrinter) :
        CheckedExprVisitor<Boolean, Unit> {

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

        override fun visit(expression: ModuleMember, context: Boolean) {
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
                if (expression.spreadExpression != null) {
                    printlnWithoutFurtherIndentation {
                        printWithoutBreak(x = "...")
                        expression.spreadExpression.printSelf(requireBreak = false)
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
                val argsString = expression.arguments.joinToString(
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
            if (expression.nextExpression == null) {
                printer.print(x = ");", requireBreak = context)
            } else {
                printer.printWithBreak(x = ");")
                expression.nextExpression.printSelf(requireBreak = context)
            }
        }
    }
}
