package samlang.parser

import TsBinaryExpression
import TsBuiltInFunctionCallExpression
import TsClassDefinition
import TsClassMemberExpression
import TsExpressionVisitor
import TsFieldAccessExpression
import TsFunctionApplicationExpression
import TsFunctionType
import TsIdentifierType
import TsIfElseExpression
import TsLambdaExpression
import TsLiteralExpression
import TsMatchExpression
import TsMemberDefinition
import TsMethodAccessExpression
import TsModule
import TsModuleReference
import TsObjectConstructorExpression
import TsObjectPattern
import TsPanicExpression
import TsPatternVisitor
import TsPosition
import TsPrimitiveType
import TsRange
import TsStatementBlockExpression
import TsStringMap
import TsThisExpression
import TsTupleConstructorExpression
import TsTuplePattern
import TsTupleType
import TsType
import TsTypeDefinition
import TsTypeVisitor
import TsUnaryExpression
import TsUndecidedType
import TsVariableExpression
import TsVariablePattern
import TsVariantConstructorExpression
import TsWildCardPattern
import samlang.ast.common.*
import samlang.ast.lang.*

private fun <V> TsStringMap<V>.toMap(): Map<String, V> = this.map { it.key to it.value }.toMap()

private fun TsPosition.toPosition(): Position = Position(line = line.toInt(), column = column.toInt())
private fun TsRange.toRange(): Range = Range(start = start.toPosition(), end = end.toPosition())
private fun TsModuleReference.toModuleReference(): ModuleReference = ModuleReference(parts = parts.toList())

private object TsTypeTransformVisitor : TsTypeVisitor<Type> {
    override fun visitPrimitive(type: TsPrimitiveType): Type = when (type.name) {
        "unit" -> Type.unit
        "int" -> Type.int
        "bool" -> Type.bool
        "string" -> Type.string
        else -> error(message = "Bad type: ${type.name}")
    }

    override fun visitIdentifier(type: TsIdentifierType): Type =
        Type.IdentifierType(identifier = type.identifier, typeArguments = type.typeArguments.map { it.toType() })

    override fun visitTuple(type: TsTupleType): Type = Type.TupleType(mappings = type.mappings.map { it.toType() })

    override fun visitFunction(type: TsFunctionType): Type =
        Type.FunctionType(
            argumentTypes = type.argumentTypes.map { it.toType() },
            returnType = type.returnType.toType()
        )

    override fun visitUndecided(type: TsUndecidedType): Type = Type.undecided()
}

private fun TsType.toType(): Type = accept(TsTypeTransformVisitor)

private object TsPatternTransformVisitor : TsPatternVisitor<Pattern> {
    override fun visitTuple(pattern: TsTuplePattern): Pattern =
        Pattern.TuplePattern(
            range = pattern.range.toRange(),
            destructedNames = pattern.destructedNames.map { it.name to it.range.toRange() }
        )

    override fun visitObject(pattern: TsObjectPattern): Pattern =
        Pattern.ObjectPattern(
            range = pattern.range.toRange(),
            destructedNames = pattern.destructedNames.map { tsObjectDestructedName ->
                Pattern.ObjectPattern.DestructedName(
                    fieldName = tsObjectDestructedName.fieldName,
                    fieldOrder = tsObjectDestructedName.fieldOrder.toInt(),
                    alias = tsObjectDestructedName.alias,
                    range = tsObjectDestructedName.range.toRange()
                )
            }
        )

    override fun visitVariable(pattern: TsVariablePattern): Pattern =
        Pattern.VariablePattern(range = pattern.range.toRange(), name = pattern.name)

    override fun visitWildcard(pattern: TsWildCardPattern): Pattern =
        Pattern.WildCardPattern(range = pattern.range.toRange())
}

internal object TsExpressionTransformVisitor : TsExpressionVisitor<Expression> {
    override fun visitLiteral(expression: TsLiteralExpression): Expression {
        val literal = expression.literal
        val range = expression.range.toRange()
        return when (literal.type) {
            "int" -> Expression.Literal.ofInt(
                range = range,
                value = literal.value.toLongOrNull() ?: error(message = "SyntaxError: Bad integer literal.")
            )
            "bool" -> if (literal.value == "true") {
                Expression.Literal.ofTrue(range = range)
            } else {
                Expression.Literal.ofFalse(range = range)
            }
            "string" -> Expression.Literal.ofString(range = range, value = literal.value)
            else -> error(message = "Bad literal!")
        }
    }

    override fun visitThis(expression: TsThisExpression): Expression =
        Expression.This(range = expression.range.toRange(), type = expression.type.toType())

    override fun visitVariable(expression: TsVariableExpression): Expression =
        Expression.Variable(range = expression.range.toRange(), name = expression.name, type = expression.type.toType())

    override fun visitClassMember(expression: TsClassMemberExpression): Expression =
        Expression.ClassMember(
            range = expression.range.toRange(),
            type = expression.type.toType(),
            typeArguments = expression.typeArguments.map { it.toType() },
            className = expression.className,
            classNameRange = expression.classNameRange.toRange(),
            memberName = expression.memberName
        )

    override fun visitTupleConstructor(expression: TsTupleConstructorExpression): Expression =
        Expression.TupleConstructor(
            range = expression.range.toRange(),
            type = expression.type.toType() as Type.TupleType,
            expressionList = expression.expressionList.map { it.accept(TsExpressionTransformVisitor) }
        )

    override fun visitObjectConstructor(expression: TsObjectConstructorExpression): Expression =
        Expression.ObjectConstructor(
            range = expression.range.toRange(),
            type = expression.type.toType(),
            fieldDeclarations = expression.fieldDeclarations.map { tsFieldConstructor ->
                val range = tsFieldConstructor.range.toRange()
                val type = tsFieldConstructor.type.toType()
                val name = tsFieldConstructor.name
                val fieldExpression = tsFieldConstructor.expression
                if (fieldExpression != null) {
                    Expression.ObjectConstructor.FieldConstructor.Field(
                        range = range,
                        type = type,
                        name = name,
                        expression = fieldExpression.accept(TsExpressionTransformVisitor)
                    )
                } else {
                    Expression.ObjectConstructor.FieldConstructor.FieldShorthand(
                        range = range,
                        type = type,
                        name = name
                    )
                }
            }
        )

    override fun visitVariantConstructor(expression: TsVariantConstructorExpression): Expression =
        Expression.VariantConstructor(
            range = expression.range.toRange(),
            type = expression.type.toType(),
            tag = expression.tag,
            tagOrder = expression.tagOrder.toInt(),
            data = expression.data.accept(TsExpressionTransformVisitor)
        )

    override fun visitFieldAccess(expression: TsFieldAccessExpression): Expression =
        Expression.FieldAccess(
            range = expression.range.toRange(),
            type = expression.type.toType(),
            expression = expression.expression.accept(TsExpressionTransformVisitor),
            fieldName = expression.fieldName,
            fieldOrder = expression.fieldOrder.toInt()
        )

    override fun visitMethodAccess(expression: TsMethodAccessExpression): Expression =
        Expression.MethodAccess(
            range = expression.range.toRange(),
            type = expression.type.toType(),
            expression = expression.expression.accept(TsExpressionTransformVisitor),
            methodName = expression.methodName
        )

    override fun visitUnary(expression: TsUnaryExpression): Expression =
        Expression.Unary(
            range = expression.range.toRange(),
            type = expression.type.toType(),
            operator = when (val operator = expression.operator) {
                "!" -> UnaryOperator.NOT
                "-" -> UnaryOperator.NEG
                else -> error(message = "Bad operator: $operator")
            },
            expression = expression.expression.accept(TsExpressionTransformVisitor)
        )

    override fun visitPanic(expression: TsPanicExpression): Expression =
        Expression.Panic(
            range = expression.range.toRange(),
            type = expression.type.toType(),
            expression = expression.expression.accept(TsExpressionTransformVisitor)
        )

    override fun visitBuiltInFunctionCall(expression: TsBuiltInFunctionCallExpression): Expression =
        Expression.BuiltInFunctionCall(
            range = expression.range.toRange(),
            type = expression.type.toType(),
            functionName = when (val operator = expression.functionName) {
                "stringToInt" -> BuiltInFunctionName.STRING_TO_INT
                "intToString" -> BuiltInFunctionName.INT_TO_STRING
                "println" -> BuiltInFunctionName.PRINTLN
                else -> error(message = "Bad operator: $operator")
            },
            argumentExpression = expression.argumentExpression.accept(TsExpressionTransformVisitor)
        )

    override fun visitFunctionApplication(expression: TsFunctionApplicationExpression): Expression =
        Expression.FunctionApplication(
            range = expression.range.toRange(),
            type = expression.type.toType(),
            functionExpression = expression.functionExpression.accept(TsExpressionTransformVisitor),
            arguments = expression.functionArguments.map { it.accept(TsExpressionTransformVisitor) }
        )

    override fun visitBinary(expression: TsBinaryExpression): Expression =
        Expression.Binary(
            range = expression.range.toRange(),
            type = expression.type.toType(),
            operator = BinaryOperator.fromRaw(text = expression.operator) ?: error(message = "Bad operator!"),
            e1 = expression.e1.accept(TsExpressionTransformVisitor),
            e2 = expression.e2.accept(TsExpressionTransformVisitor)
        )

    override fun visitIfElse(expression: TsIfElseExpression): Expression =
        Expression.IfElse(
            range = expression.range.toRange(),
            type = expression.type.toType(),
            boolExpression = expression.boolExpression.accept(TsExpressionTransformVisitor),
            e1 = expression.e1.accept(TsExpressionTransformVisitor),
            e2 = expression.e2.accept(TsExpressionTransformVisitor)
        )

    override fun visitMatch(expression: TsMatchExpression): Expression =
        Expression.Match(
            range = expression.range.toRange(),
            type = expression.type.toType(),
            matchedExpression = expression.matchedExpression.accept(TsExpressionTransformVisitor),
            matchingList = expression.matchingList.map { variantPatternToExpr ->
                Expression.Match.VariantPatternToExpr(
                    range = variantPatternToExpr.range.toRange(),
                    tag = variantPatternToExpr.tag,
                    tagOrder = variantPatternToExpr.tagOrder.toInt(),
                    dataVariable = variantPatternToExpr.dataVariable,
                    expression = variantPatternToExpr.expression.accept(TsExpressionTransformVisitor)
                )
            }
        )

    override fun visitLambda(expression: TsLambdaExpression): Expression =
        Expression.Lambda(
            range = expression.range.toRange(),
            type = expression.type.toType() as Type.FunctionType,
            parameters = expression.parameters.map { it.name to it.type.toType() },
            captured = emptyMap(),
            body = expression.body.accept(TsExpressionTransformVisitor)
        )

    override fun visitStatementBlock(expression: TsStatementBlockExpression): Expression =
        Expression.StatementBlockExpression(
            range = expression.range.toRange(),
            type = expression.type.toType(),
            block = StatementBlock(
                range = expression.block.range.toRange(),
                statements = expression.block.statements.map { tsValStatement ->
                    Statement.Val(
                        range = tsValStatement.range.toRange(),
                        pattern = tsValStatement.pattern.accept(TsPatternTransformVisitor),
                        typeAnnotation = tsValStatement.typeAnnotation.toType(),
                        assignedExpression = tsValStatement.assignedExpression.accept(TsExpressionTransformVisitor)
                    )
                },
                expression = expression.block.expression?.accept(TsExpressionTransformVisitor)
            )
        )
}

private fun transformMemberDefinition(tsMemberDefinition: TsMemberDefinition): ClassDefinition.MemberDefinition =
    ClassDefinition.MemberDefinition(
        range = tsMemberDefinition.range.toRange(),
        isPublic = tsMemberDefinition.isPublic,
        isMethod = tsMemberDefinition.isMethod,
        nameRange = tsMemberDefinition.nameRange.toRange(),
        name = tsMemberDefinition.name,
        typeParameters = tsMemberDefinition.typeParameters.toList(),
        type = tsMemberDefinition.type.toType() as Type.FunctionType,
        parameters = tsMemberDefinition.parameters.map {
            ClassDefinition.MemberDefinition.Parameter(
                name = it.name,
                nameRange = it.nameRange.toRange(),
                type = it.type.toType(),
                typeRange = it.typeRange.toRange()
            )
        },
        body = tsMemberDefinition.body.accept(TsExpressionTransformVisitor)
    )

private fun transformTypeDefinition(tsTypeDefinition: TsTypeDefinition): TypeDefinition = TypeDefinition(
    range = tsTypeDefinition.range.toRange(),
    type = when (val type = tsTypeDefinition.type) {
        "object" -> TypeDefinitionType.OBJECT
        "variant" -> TypeDefinitionType.VARIANT
        else -> error(message = "Bad type: $type")
    },
    typeParameters = tsTypeDefinition.typeParameters.toList(),
    names = tsTypeDefinition.names.toList(),
    mappings = tsTypeDefinition.mappings.toMap().mapValues { (_, fieldType) ->
        TypeDefinition.FieldType(type = fieldType.type.toType(), isPublic = fieldType.isPublic)
    }
)

private fun transformClassDefinition(tsClassDefinition: TsClassDefinition): ClassDefinition = ClassDefinition(
    range = tsClassDefinition.range.toRange(),
    nameRange = tsClassDefinition.nameRange.toRange(),
    name = tsClassDefinition.name,
    isPublic = tsClassDefinition.isPublic,
    typeDefinition = transformTypeDefinition(tsTypeDefinition = tsClassDefinition.typeDefinition),
    members = tsClassDefinition.members.map { transformMemberDefinition(it) }
)

internal fun transformModule(tsModule: TsModule): Module = Module(
    imports = tsModule.imports.map {
        ModuleMembersImport(
            range = it.range.toRange(),
            importedMembers = it.importedMembers.map { member -> member.name to member.range.toRange() },
            importedModule = it.importedModule.toModuleReference(),
            importedModuleRange = it.importedModuleRange.toRange()
        )
    },
    classDefinitions = tsModule.classDefinitions.map { transformClassDefinition(tsClassDefinition = it) }
)
