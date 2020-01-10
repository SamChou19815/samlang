package samlang.printer

import java.io.OutputStream
import java.io.PrintStream
import org.apache.commons.text.CaseUtils
import samlang.ast.common.BuiltInFunctionName
import samlang.ast.common.ModuleMembersImport
import samlang.ast.common.ModuleReference
import samlang.ast.common.Type
import samlang.ast.common.Type.FunctionType
import samlang.ast.common.Type.IdentifierType
import samlang.ast.common.Type.PrimitiveType
import samlang.ast.common.Type.TupleType
import samlang.ast.common.Type.UndecidedType
import samlang.ast.common.TypeDefinition
import samlang.ast.common.TypeDefinitionType
import samlang.ast.common.TypeVisitor
import samlang.ast.hir.HighIrClassDefinition
import samlang.ast.hir.HighIrExpression
import samlang.ast.hir.HighIrExpression.Binary
import samlang.ast.hir.HighIrExpression.BuiltInFunctionApplication
import samlang.ast.hir.HighIrExpression.ClassMember
import samlang.ast.hir.HighIrExpression.ClosureApplication
import samlang.ast.hir.HighIrExpression.FieldAccess
import samlang.ast.hir.HighIrExpression.FunctionApplication
import samlang.ast.hir.HighIrExpression.Lambda
import samlang.ast.hir.HighIrExpression.Literal
import samlang.ast.hir.HighIrExpression.MethodAccess
import samlang.ast.hir.HighIrExpression.MethodApplication
import samlang.ast.hir.HighIrExpression.ObjectConstructor
import samlang.ast.hir.HighIrExpression.Ternary
import samlang.ast.hir.HighIrExpression.This
import samlang.ast.hir.HighIrExpression.TupleConstructor
import samlang.ast.hir.HighIrExpression.Unary
import samlang.ast.hir.HighIrExpression.UnitExpression
import samlang.ast.hir.HighIrExpression.Variable
import samlang.ast.hir.HighIrExpression.VariantConstructor
import samlang.ast.hir.HighIrExpressionVisitor
import samlang.ast.hir.HighIrFunction
import samlang.ast.hir.HighIrModule
import samlang.ast.hir.HighIrPattern
import samlang.ast.hir.HighIrStatement
import samlang.ast.hir.HighIrStatement.ConstantDefinition
import samlang.ast.hir.HighIrStatement.IfElse
import samlang.ast.hir.HighIrStatement.LetDeclaration
import samlang.ast.hir.HighIrStatement.Match
import samlang.ast.hir.HighIrStatement.Return
import samlang.ast.hir.HighIrStatement.Throw
import samlang.ast.hir.HighIrStatement.VariableAssignment
import samlang.ast.hir.HighIrStatementVisitor
import samlang.util.IndentedPrinter

fun printJavaOuterClass(stream: OutputStream, moduleReference: ModuleReference, outerClass: HighIrModule) {
    // use 2-space
    val indentedPrinter = IndentedPrinter(printStream = PrintStream(stream), indentationSymbol = "  ")
    JavaPrinter(printer = indentedPrinter).printOuterClass(moduleReference = moduleReference, outerClass = outerClass)
}

fun printJavaSamlangIntrinsics(stream: OutputStream) {
    // use 2-space
    val indentedPrinter = IndentedPrinter(printStream = PrintStream(stream), indentationSymbol = "  ")
    JavaPrinter(printer = indentedPrinter).printIntrinsics()
}

fun printJavaOuterClass(moduleReference: ModuleReference, outerClass: HighIrModule): String =
    printToStream { stream ->
        printJavaOuterClass(stream = stream, moduleReference = moduleReference, outerClass = outerClass)
    }

fun getJavaSamlangIntrinsics(): String = printToStream { stream -> printJavaSamlangIntrinsics(stream = stream) }

fun javaizeName(name: String): String =
    CaseUtils.toCamelCase(name, true, '-', '.')

private class JavaPrinter(private val printer: IndentedPrinter) {
    private var temporaryVariableId: Int = 0

    fun printIntrinsics() {
        printer.printWithBreak(x = "package stdlib;")
        printer.println()
        printer.printWithBreak(x = "public final class SamlangIntrinsics\$ {")
        printer.indented {
            printWithBreak(x = "private SamlangIntrinsics$() {}")
            for (size in 1..22) {
                val numberList = (0 until size).toList()
                val argumentTypeParameters = numberList.joinToString(separator = ", ") { "T$it" }
                printWithBreak(x = "public static final class Tuple$size<$argumentTypeParameters> {")
                indented {
                    for (i in 0 until size) {
                        printWithBreak(x = "public final T$i value$i;")
                    }
                    val parameters = numberList.joinToString(separator = ", ") { "T$it value$it" }
                    printWithBreak(x = "public Tuple$size($parameters) {")
                    indented {
                        for (i in 0 until size) {
                            printWithBreak(x = "this.value$i = value$i;")
                        }
                    }
                    printWithBreak(x = "}")
                }
                printWithBreak(x = "}")
            }
            for (size in 0..22) {
                if (size == 0) {
                    printWithBreak(x = "public interface Function0<R> { R apply(); }")
                } else {
                    val argumentTypeParameters = (0 until size).toList().joinToString(separator = ", ") { "T$it" }
                    val methodParameters = (0 until size).toList().joinToString(separator = ", ") { "T$it arg$it" }
                    printWithBreak(x = "public interface Function$size<$argumentTypeParameters, R> {")
                    indented { printWithBreak(x = "R apply($methodParameters);") }
                    printWithBreak(x = "}")
                }
            }
        }
        printer.printWithBreak(x = "}")
    }

    fun printOuterClass(moduleReference: ModuleReference, outerClass: HighIrModule) {
        // Print package
        val parts = moduleReference.parts.map(transform = ::javaizeName)
        val packageParts = parts.subList(fromIndex = 0, toIndex = moduleReference.parts.size - 1)
        if (packageParts.isNotEmpty()) {
            val packageName = packageParts.joinToString(separator = ".")
            printer.printWithBreak(x = "package $packageName;")
            printer.println()
        }

        // Print imports
        val simpleClassName = parts.last()
        val (imports, innerStaticClasses) = outerClass
        if (parts.size > 1) {
            printer.printWithBreak(x = "import stdlib.SamlangIntrinsics\$;")
            imports.forEach(action = ::printImport)
            printer.println()
        }

        // Print actual class
        printer.printWithBreak(x = "public final class $simpleClassName {")
        printer.indented {
            innerStaticClasses.forEach(action = ::printStaticInnerClass)
            println()
        }
        printer.printWithBreak(x = "}")
    }

    private fun printImport(oneImport: ModuleMembersImport) {
        val modulePartString = oneImport.importedModule.parts.joinToString(separator = ".") { javaizeName(it) }
        oneImport.importedMembers.forEach { (memberName, _) ->
            printer.printlnWithoutFurtherIndentation {
                printWithoutBreak(x = "$modulePartString.$memberName;")
            }
        }
    }

    private fun printStaticInnerClass(staticInnerClass: HighIrClassDefinition) {
        val (className, typeDefinition, members) = staticInnerClass
        printer.printlnWithoutFurtherIndentation {
            printWithoutBreak(x = "public static class $className")
            if (typeDefinition.typeParameters.isNotEmpty()) {
                printWithBreak(x = typeParametersToString(typeParameters = typeDefinition.typeParameters))
                printWithoutBreak(x = "{")
            } else {
                printWithoutBreak(x = " {")
            }
        }
        printer.indented {
            printTypeDefinition(className = className, definition = typeDefinition)
            members.forEach { method ->
                println()
                printMethod(method = method, typeDefinition = typeDefinition)
            }
        }
        printer.printWithBreak(x = "}")
    }

    private fun printTypeDefinition(className: String, definition: TypeDefinition) {
        if (definition.type == TypeDefinitionType.OBJECT) {
            printObjectTypeDefinition(className = className, definition = definition)
        } else {
            printVariantTypeDefinition(className = className, definition = definition)
        }
    }

    private fun printObjectTypeDefinition(className: String, definition: TypeDefinition) {
        val (_, _, typeParameters, names, mapping) = definition
        val thisTypeString = "$className${typeParametersToString(typeParameters = typeParameters)}"
        val orderedMapping = names.map { it to (mapping[it] ?: error(message = "Bad type definition")) }
        orderedMapping.forEach { (fieldName, fieldType) ->
            val (type, isPublic) = fieldType
            val modifier = if (isPublic) "public" else "private"
            printer.printWithBreak(x = "$modifier ${type.toJavaTypeString()} $fieldName;")
        }
        val constructorParameters = orderedMapping.joinToString(separator = ", ") { (fieldName, fieldType) ->
            "${fieldType.type.toJavaTypeString()} $fieldName"
        }
        printer.printWithBreak(x = "private $className($constructorParameters) {")
        printer.indented { names.forEach { field -> printWithBreak(x = "this.$field = $field;") } }
        printer.printWithBreak(x = "}")
        if (orderedMapping.isEmpty()) {
            printer.printWithBreak(x = "private $className($thisTypeString other) {")
        } else {
            printer.printWithBreak(x = "private $className($thisTypeString other, $constructorParameters) {")
        }
        printer.indented { names.forEach { field -> printWithBreak(x = "this.$field = $field;") } }
        printer.printWithBreak(x = "}")
    }

    private fun printVariantTypeDefinition(className: String, definition: TypeDefinition) {
        val (_, _, typeParameters, _, mapping) = definition
        val typeParameterString = typeParametersToString(typeParameters = typeParameters)
        val parentType = "$className$typeParameterString"
        mapping.forEach { (variantName, variantType) ->
            val type = variantType.type
            val thisType = "$variantName$typeParameterString"
            val valueType = if (type is PrimitiveType && type.name == Type.PrimitiveTypeName.UNIT) {
                "Void"
            } else {
                type.toJavaTypeString()
            }
            printer.printWithBreak(x = "private static final class $thisType extends $parentType {")
            printer.indented {
                printWithBreak(x = "private final $valueType value;")
                printWithBreak(x = "$variantName($valueType value) { this.value = value; }")
            }
            printer.printWithBreak(x = "}")
        }
    }

    private fun printMethod(method: HighIrFunction, typeDefinition: TypeDefinition) {
        printer.printlnWithoutFurtherIndentation {
            printWithoutBreak(x = if (method.isPublic) "public " else "private ")
            if (!method.isMethod) {
                printWithoutBreak(x = "static ")
            }
            if (method.typeParameters.isNotEmpty()) {
                printWithBreak(x = typeParametersToString(typeParameters = method.typeParameters))
            }
            printWithBreak(x = method.returnType.toJavaTypeString())
            printWithoutBreak(x = method.name)
            printWithoutBreak(x = "(")
            printWithoutBreak(
                x = method.parameters.joinToString(separator = ", ") { (name, type) ->
                    "${type.toJavaTypeString()} $name"
                }
            )
            printWithoutBreak(x = ") {")
        }
        val statementPrinter = JavaStatementPrinter(typeDefinition = typeDefinition)
        printer.indented { method.body.forEach { it.accept(visitor = statementPrinter) } }
        printer.printWithBreak(x = "}")
    }

    private fun allocateVariable(): String {
        val id = temporaryVariableId
        temporaryVariableId++
        return "_JAVA_PRINTING_$id"
    }

    private inner class JavaStatementPrinter(typeDefinition: TypeDefinition) : HighIrStatementVisitor<Unit> {
        private val expressionPrinter: JavaExpressionPrinter = JavaExpressionPrinter(
            typeDefinition = typeDefinition,
            printStatement = this::printStatement
        )

        private fun printStatement(statement: HighIrStatement): Unit = statement.accept(visitor = this)

        override fun visit(statement: Throw) {
            printer.printlnWithoutFurtherIndentation {
                printWithoutBreak(x = "throw new Error(")
                statement.expression.accept(visitor = expressionPrinter)
                printWithoutBreak(x = ");")
            }
        }

        override fun visit(statement: IfElse) {
            printer.printlnWithoutFurtherIndentation {
                printWithoutBreak(x = "if (")
                statement.booleanExpression.accept(visitor = expressionPrinter)
                printWithoutBreak(x = ") {")
            }
            printer.indented {
                statement.s1.forEach(::printStatement)
            }
            printer.printWithBreak(x = "} else {")
            printer.indented {
                statement.s2.forEach(::printStatement)
            }
            printer.printWithBreak(x = "}")
        }

        override fun visit(statement: Match) {
            val (type, assignedTemporaryVariable, matchedVariable, matchedVariableType, matchingList) = statement
            if (assignedTemporaryVariable != null) {
                printer.printWithBreak(x = "${type.toJavaTypeString()} $assignedTemporaryVariable;")
            }
            val totalNumberOfCases = matchingList.size
            for (i in 0 until totalNumberOfCases) {
                val (tag, _, dataVariable, statements, finalExpression) = matchingList[i]
                printer.printlnWithoutFurtherIndentation {
                    if (i > 0) {
                        printWithoutBreak(x = "} else ")
                    }
                    printWithoutBreak(x = "if ")
                    printWithoutBreak(x = "($matchedVariable instanceof ${matchedVariableType.identifier}.$tag) {")
                }
                printer.indented {
                    if (dataVariable != null) {
                        printlnWithoutFurtherIndentation {
                            printWithoutBreak(x = "final var $dataVariable = ")
                            val baseType = matchedVariableType.identifier
                            val specificType = Type.id(
                                identifier = tag, typeArguments = matchedVariableType.typeArguments
                            )
                            val castToType = "$baseType.${specificType.toJavaTypeString()}"
                            printWithoutBreak(x = "(($castToType) $matchedVariable).value;")
                        }
                    }
                    statements.forEach(action = ::printStatement)
                    if (finalExpression != null) {
                        printlnWithoutFurtherIndentation {
                            printWithoutBreak(x = "$assignedTemporaryVariable = ")
                            finalExpression.accept(visitor = expressionPrinter)
                            printWithoutBreak(x = ";")
                        }
                    }
                }
            }
            printer.printWithBreak(x = "} else {")
            printer.indented { printWithBreak(x = "throw new Error(\"NOT_EXHAUSTIVE!\");") }
            printer.printWithBreak(x = "}")
        }

        override fun visit(statement: LetDeclaration) {
            val type = statement.typeAnnotation
            val typeString = if (type == Type.unit) "Void" else type.toJavaTypeString()
            printer.printWithBreak(x = "$typeString ${statement.name};")
        }

        override fun visit(statement: VariableAssignment) {
            printer.printlnWithoutFurtherIndentation {
                printWithBreak(x = statement.name)
                printWithBreak(x = "=")
                statement.assignedExpression.accept(visitor = expressionPrinter)
                printWithoutBreak(";")
            }
        }

        override fun visit(statement: ConstantDefinition) {
            val (pattern, typeAnnotation, assignedExpression) = statement
            if (pattern is HighIrPattern.WildCardPattern && assignedExpression !is FunctionApplication) {
                return
            }
            val typeString = if (typeAnnotation == Type.unit) "Void" else typeAnnotation.toJavaTypeString()
            printer.printlnWithoutFurtherIndentation {
                when (pattern) {
                    is HighIrPattern.TuplePattern -> {
                        val temporaryVariable = allocateVariable()
                        printWithoutBreak(x = "$typeString $temporaryVariable = ")
                        assignedExpression.accept(visitor = expressionPrinter)
                        printWithBreak(x = ";")
                        pattern.destructedNames.forEachIndexed { index, name ->
                            if (name != null) {
                                printWithoutBreak(x = "final var $name = $temporaryVariable.value$index;")
                            }
                        }
                    }
                    is HighIrPattern.ObjectPattern -> {
                        val temporaryVariable = allocateVariable()
                        printWithoutBreak(x = "$typeString $temporaryVariable = ")
                        assignedExpression.accept(visitor = expressionPrinter)
                        printWithBreak(x = ";")
                        pattern.destructedNames.forEach { (name, _, alias) ->
                            printWithoutBreak(x = "final var ${alias ?: name} = $temporaryVariable.$name;")
                        }
                    }
                    is HighIrPattern.VariablePattern -> {
                        if (typeString == "Void") {
                            assignedExpression.accept(visitor = expressionPrinter)
                            printWithBreak(x = ";")
                            printWithBreak(x = "$typeString ${pattern.name} = null;")
                        } else {
                            printWithoutBreak(x = "$typeString ${pattern.name} = ")
                            assignedExpression.accept(visitor = expressionPrinter)
                            printWithBreak(x = ";")
                        }
                    }
                    is HighIrPattern.WildCardPattern -> {
                        assignedExpression.accept(visitor = expressionPrinter)
                        printWithBreak(x = ";")
                    }
                }
            }
        }

        override fun visit(statement: Return) {
            val returnedExpression = statement.expression
            if (returnedExpression == null) {
                printer.printWithBreak(x = "return;")
            } else {
                printer.printlnWithoutFurtherIndentation {
                    printWithoutBreak(x = "return ")
                    returnedExpression.accept(visitor = expressionPrinter)
                    printWithoutBreak(x = ";")
                }
            }
        }

        override fun visit(statement: HighIrStatement.Block) {
            printer.printWithBreak(x = "{")
            printer.indented {
                statement.statements.forEach { it.accept(visitor = this@JavaStatementPrinter) }
            }
            printer.printWithBreak(x = "}")
        }
    }

    private inner class JavaExpressionPrinter(
        private val typeDefinition: TypeDefinition,
        private val printStatement: (HighIrStatement) -> Unit
    ) : HighIrExpressionVisitor<Unit> {

        private fun HighIrExpression.printSelf(withParenthesis: Boolean = false): Unit =
            if (withParenthesis) {
                printer.printlnWithoutFurtherIndentation {
                    printWithoutBreak(x = "(")
                    printSelf()
                    print(x = ")", requireBreak = false)
                }
            } else accept(visitor = this@JavaExpressionPrinter)

        override fun visit(expression: UnitExpression) {
            printer.printWithoutBreak(x = "null")
        }

        override fun visit(expression: Literal) {
            val literalString = when (val literal = expression.literal) {
                is samlang.ast.common.Literal.IntLiteral -> "${literal.value}L"
                else -> literal.prettyPrintedValue
            }
            printer.printWithoutBreak(x = literalString)
        }

        override fun visit(expression: Variable) {
            printer.printWithoutBreak(x = expression.name)
        }

        override fun visit(expression: This) {
            printer.printWithoutBreak(x = "this")
        }

        override fun visit(expression: ClassMember) {
            printer.printWithoutBreak(x = "${expression.className}::${expression.memberName}")
        }

        override fun visit(expression: TupleConstructor) {
            val expressions = expression.expressionList
            printer.printWithoutBreak(x = "new SamlangIntrinsics$.Tuple${expressions.size}<")
            printer.printWithoutBreak(
                x = expressions.joinToString(separator = ", ") { it.type.toJavaTypeString(boxed = true) }
            )
            printer.printWithoutBreak(x = ">(")
            val size = expressions.size
            for (i in 0 until size) {
                expressions[i].accept(visitor = this)
                if (i < size - 1) {
                    printer.printWithoutBreak(x = ", ")
                }
            }
            printer.printWithoutBreak(x = ")")
        }

        override fun visit(expression: ObjectConstructor) {
            val (type, fieldDeclaration) = expression
            val fields = typeDefinition.names
            val declarationMap = fieldDeclaration.toMap()
            printer.printWithoutBreak(x = "new ${type.toJavaTypeString()}(")
            fields.asSequence().forEachIndexed { i, fieldName ->
                val expressionToAssignToField = declarationMap[fieldName] ?: error(message = "Bad declaration!")
                expressionToAssignToField.accept(visitor = this)
                if (i != fields.size - 1) {
                    printer.printWithoutBreak(x = ", ")
                }
            }
            printer.printWithoutBreak(x = ")")
        }

        override fun visit(expression: VariantConstructor) {
            val (identifier, typeArguments) = expression.type
            val innerConstructorString =
                IdentifierType(identifier = expression.tag, typeArguments = typeArguments).toJavaTypeString()
            printer.printWithoutBreak(x = "new $identifier.$innerConstructorString(")
            expression.data.accept(visitor = this)
            printer.printWithoutBreak(x = ")")
        }

        override fun visit(expression: FieldAccess) {
            printer.printlnWithoutFurtherIndentation {
                expression.expression.printSelf(
                    withParenthesis = expression.expression.precedence >= expression.precedence
                )
                printWithoutBreak(x = ".${expression.fieldName}")
            }
        }

        override fun visit(expression: MethodAccess) {
            printer.printlnWithoutFurtherIndentation {
                expression.expression.printSelf(
                    withParenthesis = expression.expression.precedence >= expression.precedence
                )
                printWithoutBreak(x = "::${expression.methodName}")
            }
        }

        override fun visit(expression: Unary) {
            printer.printlnWithoutFurtherIndentation {
                printWithoutBreak(x = expression.operator.symbol)
                expression.expression.printSelf(
                    withParenthesis = expression.expression.precedence > expression.precedence
                )
            }
        }

        private fun printFunctionCallArguments(arguments: List<HighIrExpression>) {
            printer.printWithoutBreak(x = "(")
            arguments.forEachIndexed { index, e ->
                e.printSelf()
                if (index != arguments.size - 1) {
                    printer.printWithBreak(x = ",")
                }
            }
            printer.printWithoutBreak(x = ")")
        }

        override fun visit(expression: BuiltInFunctionApplication) {
            val functionName = when (expression.functionName) {
                BuiltInFunctionName.STRING_TO_INT -> "Long.parseLong"
                BuiltInFunctionName.INT_TO_STRING -> "String.valueOf"
                BuiltInFunctionName.PRINTLN -> "System.out.println"
            }
            printer.printlnWithoutFurtherIndentation {
                printWithoutBreak(x = "$functionName(")
                expression.argument.printSelf()
                printWithoutBreak(x = ")")
            }
        }

        override fun visit(expression: FunctionApplication) {
            printer.printlnWithoutFurtherIndentation {
                val (_, className, memberName, typeArguments, arguments) = expression
                if (typeArguments.isEmpty()) {
                    printWithoutBreak(x = "$className.$memberName")
                } else {
                    val typeArgumentString = typeArguments.joinToString(separator = ", ") {
                        it.toJavaTypeString(boxed = true)
                    }
                    printWithoutBreak(x = "$className.<$typeArgumentString>$memberName")
                }
                printFunctionCallArguments(arguments = arguments)
            }
        }

        override fun visit(expression: MethodApplication) {
            printer.printlnWithoutFurtherIndentation {
                expression.objectExpression.printSelf(
                    withParenthesis = expression.objectExpression.precedence >= expression.precedence
                )
                printWithoutBreak(x = ".${expression.methodName}")
                printFunctionCallArguments(arguments = expression.arguments)
            }
        }

        override fun visit(expression: ClosureApplication) {
            printer.printlnWithoutFurtherIndentation {
                expression.functionExpression.printSelf(
                    withParenthesis = expression.functionExpression.precedence >= expression.precedence
                )
                printer.printWithoutBreak(x = ".apply")
                printFunctionCallArguments(arguments = expression.arguments)
            }
        }

        override fun visit(expression: Binary) {
            expression.e1.printSelf(withParenthesis = expression.e1.precedence >= expression.precedence)
            printer.printWithoutBreak(x = " ${expression.operator.symbol} ")
            expression.e2.printSelf(withParenthesis = expression.e2.precedence >= expression.precedence)
        }

        override fun visit(expression: Ternary) {
            printer.printlnWithoutFurtherIndentation {
                expression.boolExpression.printSelf(
                    withParenthesis = expression.boolExpression.precedence >= expression.precedence
                )
                printWithoutBreak(x = " ? ")
                expression.e1.printSelf(withParenthesis = expression.e1.precedence >= expression.precedence)
                printWithoutBreak(x = " : ")
                expression.e2.printSelf(withParenthesis = expression.e2.precedence >= expression.precedence)
            }
        }

        override fun visit(expression: Lambda) {
            val parameterString =
                expression.parameters.joinToString(separator = ", ", prefix = "(", postfix = ")") { (name, type) ->
                    "${type.toJavaTypeString(boxed = true)} $name"
                }
            printer.printlnWithoutFurtherIndentation {
                printWithoutBreak(x = parameterString)
                printWithoutBreak(x = " -> {")
                expression.body.forEach(action = printStatement)
                printWithoutBreak(x = "}")
            }
        }
    }
}

private fun Type.toJavaTypeString(boxed: Boolean = false): String =
    this.accept(visitor = JavaContextAwareTypeToStringConverter, context = boxed)

/**
 * Context: whether the primitive type should be boxed.
 * Return: converted type string in Java syntax.
 */
private object JavaContextAwareTypeToStringConverter : TypeVisitor<Boolean, String> {

    private fun Type.toBoxedString(): String =
        this.accept(visitor = this@JavaContextAwareTypeToStringConverter, context = true)

    override fun visit(type: PrimitiveType, context: Boolean): String = when (type.name) {
        Type.PrimitiveTypeName.UNIT -> if (context) "Void" else "void"
        Type.PrimitiveTypeName.BOOL -> if (context) "Boolean" else "boolean"
        Type.PrimitiveTypeName.INT -> if (context) "Long" else "long"
        Type.PrimitiveTypeName.STRING -> "String"
    }

    override fun visit(type: IdentifierType, context: Boolean): String = type.typeArguments
        .takeIf { it.isNotEmpty() }
        ?.joinToString(separator = ", ", prefix = "${type.identifier}<", postfix = ">") { it.toBoxedString() }
        ?: type.identifier

    override fun visit(type: TupleType, context: Boolean): String {
        val mappings = type.mappings
        val size = mappings.size
        if (size > 22) {
            error(message = "Should be enforced in parser!")
        }
        return mappings.joinToString(separator = ", ", prefix = "SamlangIntrinsics$.Tuple$size<", postfix = ">") {
            it.toBoxedString()
        }
    }

    override fun visit(type: FunctionType, context: Boolean): String {
        val (argumentTypes, returnType) = type
        val size = argumentTypes.size
        if (size > 22) {
            error(message = "Should be enforced in parser!")
        }
        return argumentTypes.joinToString(
            separator = ", ",
            prefix = "SamlangIntrinsics$.Function$size<",
            postfix = ", ${returnType.toBoxedString()}>"
        ) { it.toBoxedString() }
    }

    override fun visit(type: UndecidedType, context: Boolean): String =
        error(message = "There should be no undecided type at this point!")
}
