package samlang.compiler.printer

import samlang.ast.checked.*
import samlang.util.IndentedPrinter
import java.io.PrintStream

object PrettyPrinter {

    fun prettyPrint(program: CheckedProgram, printStream: PrintStream) {
        // use 4-space
        val indentedPrinter = IndentedPrinter(printStream = printStream, indentationSymbol = "    ")
        TopLevelPrinter(printer = indentedPrinter).print(program = program)
    }

    private class TopLevelPrinter(private val printer: IndentedPrinter) {

        private val exprPrinter: ExprPrinter = ExprPrinter(printer = printer)

        fun print(program: CheckedProgram) {
            program.modules.forEach { module ->
                print(module = module)
                printer.println()
            }
        }

        private fun print(module: CheckedModule) {
            val (name, typeDef, members) = module
            if (typeDef == null) {
                printer.printWithBreak(x = "util $name {")
                printer.indented {
                    println()
                    members.forEach { printMember(member = it) }
                }
                printer.printWithBreak(x = "}")
            } else {
                val typeParamString = typeDef.typeParams
                    ?.joinToString(separator = ", ", prefix = "<", postfix = ">")
                    ?: ""
                printer.printWithBreak(x = "class $name$typeParamString(")
                printer.indented {
                    when (typeDef) {
                        is CheckedModule.CheckedTypeDef.ObjectType -> {
                            typeDef.mappings.forEach { (field, type) ->
                                printWithBreak(x = "$field: $type,")
                            }
                        }
                        is CheckedModule.CheckedTypeDef.VariantType -> {
                            typeDef.mappings.forEach { (tag, dataType) ->
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

        private fun printMember(member: CheckedModule.CheckedMemberDefinition) {
            val (isPublic, isMethod, name, type, value) = member
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

    private class ExprPrinter(private val printer: IndentedPrinter) : CheckedExprVisitor<Boolean, Unit> {

        private fun CheckedExpr.printSelf(requireBreak: Boolean, withParenthesis: Boolean = false): Unit =
            if (withParenthesis) {
                printer.printlnWithoutFurtherIndentation {
                    printWithoutBreak(x = "(")
                    printSelf(requireBreak = false)
                    print(x = ")", requireBreak = requireBreak)
                }
            } else accept(visitor = this@ExprPrinter, context = requireBreak)

        override fun visit(expr: CheckedExpr.Literal, context: Boolean) {
            printer.print(x = expr.literal.prettyPrintedValue, requireBreak = context)
        }

        override fun visit(expr: CheckedExpr.This, context: Boolean) {
            printer.print(x = "this", requireBreak = context)
        }

        override fun visit(expr: CheckedExpr.Variable, context: Boolean) {
            printer.print(x = expr.name, requireBreak = context)
        }

        override fun visit(expr: CheckedExpr.ModuleMember, context: Boolean) {
            printer.print(x = "${expr.moduleName}::${expr.memberName}", requireBreak = context)
        }

        override fun visit(expr: CheckedExpr.TupleConstructor, context: Boolean) {
            printer.printlnWithoutFurtherIndentation {
                printWithoutBreak(x = "[")
                expr.exprList.forEachIndexed { index, e ->
                    e.printSelf(requireBreak = false)
                    if (index != expr.exprList.size - 1) {
                        printWithBreak(x = ",")
                    }
                }
                print(x = "]", requireBreak = context)
            }
        }

        override fun visit(expr: CheckedExpr.ObjectConstructor, context: Boolean) {
            printer.printWithBreak(x = "{")
            printer.indented {
                if (expr.spreadExpr != null) {
                    printlnWithoutFurtherIndentation {
                        printWithoutBreak(x = "...")
                        expr.spreadExpr.printSelf(requireBreak = false)
                        printWithBreak(x = ",")
                    }
                }
                expr.fieldDeclarations.forEach { constructor ->
                    printlnWithoutFurtherIndentation {
                        when (constructor) {
                            is CheckedExpr.ObjectConstructor.FieldConstructor.Field -> {
                                printWithBreak(x = "${constructor.name}:")
                                constructor.expr.printSelf(requireBreak = false)
                            }
                            is CheckedExpr.ObjectConstructor.FieldConstructor.FieldShorthand -> {
                                printWithoutBreak(x = constructor.name)
                            }
                        }
                        printWithBreak(x = ",")
                    }
                }
            }
            printer.print(x = "}", requireBreak = context)
        }

        override fun visit(expr: CheckedExpr.VariantConstructor, context: Boolean) {
            printer.printlnWithoutFurtherIndentation {
                printWithoutBreak(x = "${expr.tag}(")
                expr.data.printSelf(requireBreak = false)
                print(x = ")", requireBreak = context)
            }
        }

        override fun visit(expr: CheckedExpr.MethodAccess, context: Boolean) {
            printer.printlnWithoutFurtherIndentation {
                expr.expr.printSelf(requireBreak = false, withParenthesis = expr.expr.precedence >= expr.precedence)
                print(x = ".${expr.methodName}", requireBreak = context)
            }
        }

        override fun visit(expr: CheckedExpr.Unary, context: Boolean) {
            printer.printlnWithoutFurtherIndentation {
                printWithoutBreak(x = expr.operator.symbol)
                expr.expr.printSelf(requireBreak = context, withParenthesis = expr.expr.precedence >= expr.precedence)
            }
        }

        override fun visit(expr: CheckedExpr.Panic, context: Boolean) {
            printer.printlnWithoutFurtherIndentation {
                printWithoutBreak(x = "panic(")
                expr.expr.printSelf(requireBreak = false)
                print(x = ")", requireBreak = context)
            }
        }

        override fun visit(expr: CheckedExpr.FunApp, context: Boolean) {
            printer.printlnWithoutFurtherIndentation {
                expr.funExpr.printSelf(
                    requireBreak = false,
                    withParenthesis = expr.funExpr.precedence >= expr.precedence
                )
                printWithoutBreak(x = "(")
                expr.arguments.forEachIndexed { index, e ->
                    e.printSelf(requireBreak = false)
                    if (index != expr.arguments.size - 1) {
                        printWithBreak(x = ",")
                    }
                }
                print(x = ")", requireBreak = context)
            }
        }

        override fun visit(expr: CheckedExpr.Binary, context: Boolean) {
            printer.printlnWithoutFurtherIndentation {
                expr.e1.printSelf(requireBreak = true, withParenthesis = expr.e1.precedence >= expr.precedence)
                printWithBreak(x = expr.operator.symbol)
                expr.e2.printSelf(requireBreak = context, withParenthesis = expr.e2.precedence >= expr.precedence)
            }
        }

        override fun visit(expr: CheckedExpr.IfElse, context: Boolean) {
            printer.printlnWithoutFurtherIndentation {
                printWithoutBreak(x = "if (")
                expr.boolExpr.printSelf(requireBreak = false)
                printWithoutBreak(x = ") then (")
            }
            printer.indented { expr.e1.printSelf(requireBreak = true) }
            printer.printWithBreak(x = ") else (")
            printer.indented { expr.e2.printSelf(requireBreak = true) }
            printer.print(x = ")", requireBreak = context)
        }

        override fun visit(expr: CheckedExpr.Match, context: Boolean) {
            printer.printlnWithoutFurtherIndentation {
                printWithoutBreak(x = "match (")
                expr.matchedExpr.printSelf(requireBreak = false)
                printWithBreak(x = ") {")
            }
            printer.indented {
                expr.matchingList.forEach { variantPatternToExpr ->
                    printlnWithoutFurtherIndentation {
                        printWithBreak(x = "| ${variantPatternToExpr.tag}")
                        printWithBreak(x = variantPatternToExpr.dataVariable ?: "_")
                        printWithBreak(x = "-> (")
                    }
                    indented { variantPatternToExpr.expr.printSelf(requireBreak = true) }
                    printWithBreak(x = ")")
                }
            }
            printer.print(x = "}", requireBreak = context)
        }

        override fun visit(expr: CheckedExpr.Lambda, context: Boolean) {
            printer.printlnWithoutFurtherIndentation {
                val argsString = expr.arguments.joinToString(
                    separator = ", ", prefix = "(", postfix = ")"
                ) { (n, t) -> "$n: $t" }
                printWithBreak(x = "$argsString -> (")
            }
            printer.indented { expr.body.printSelf(requireBreak = true) }
            printer.print(x = ")", requireBreak = context)
        }

        override fun visit(expr: CheckedExpr.Val, context: Boolean) {
            printer.printlnWithoutFurtherIndentation {
                val patternString = when (val p = expr.pattern) {
                    is CheckedPattern.TuplePattern -> {
                        p.destructedNames.joinToString(separator = ", ", prefix = "[", postfix = "]") { it ?: "_" }
                    }
                    is CheckedPattern.ObjectPattern -> {
                        p.destructedNames.joinToString(separator = ", ", prefix = "{ ", postfix = " }") { (o, n) ->
                            if (n == null) {
                                o
                            } else {
                                "$o as $n"
                            }
                        }
                    }
                    is CheckedPattern.VariablePattern -> p.name
                    CheckedPattern.WildcardPattern -> "_"
                }
                printWithBreak(x = "val $patternString: ${expr.assignedExpr.type} = (")
            }
            printer.indented { expr.assignedExpr.printSelf(requireBreak = true) }
            if (expr.nextExpr == null) {
                printer.print(x = ");", requireBreak = context)
            } else {
                printer.printWithBreak(x = ");")
                expr.nextExpr.printSelf(requireBreak = context)
            }
        }

    }

}

