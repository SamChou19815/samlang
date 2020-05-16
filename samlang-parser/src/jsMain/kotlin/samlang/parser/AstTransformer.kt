package samlang.parser

import samlang.ast.common.*
import samlang.ast.lang.ClassDefinition
import samlang.ast.lang.Expression
import samlang.ast.lang.Module
import TsMap
import ClassDefinition as TsClassDefinition
import FunctionType as TsFunctionType
import Module as TsModule
import ModuleReference as TsModuleReference
import Position as TsPosition
import PrimitiveType as TsPrimitiveType
import Range as TsRange
import TupleType as TsTupleType
import Type as TsType
import TypeDefinition as TsTypeDefinition
import MemberDefinition as TsMemberDefinition
import LiteralExpression as TsLiteralExpression
import ThisExpression as TsThisExpression
import VariableExpression as TsVariableExpression
import ClassMemberExpression as TsClassMemberExpression
import TupleConstructorExpression as TsTupleConstructorExpression
import ObjectConstructorExpression as TsObjectConstructorExpression
import VariantConstructorExpression as TsVariantConstructorExpression
import FieldAccessExpression as TsFieldAccessExpression
import MethodAccessExpression as TsMethodAccessExpression
import UnaryExpression as TsUnaryExpression
import PanicExpression as TsPanicExpression
import BuiltInFunctionCallExpression as TsBuiltInFunctionCallExpression
import FunctionApplicationExpression as TsFunctionApplicationExpression
import BinaryExpression as TsBinaryExpression
import IfElseExpression as TsIfElseExpression
import MatchExpression as TsMatchExpression
import LambdaExpression as TsLambdaExpression
import StatementBlockExpression as TsStatementBlockExpression
import ExpressionVisitor as TsExpressionVisitor
import UndecidedType as TsUndecidedType

fun <K, V> TsMap<K, V>.toMap(): Map<K, V> = this.map { it.key to it.value }.toMap()

fun TsPosition.toPosition(): Position = Position(line = line.toInt(), column = column.toInt())
fun TsRange.toRange(): Range = Range(start = start.toPosition(), end = end.toPosition())
fun TsModuleReference.toModuleReference(): ModuleReference = ModuleReference(parts = parts.toList())

fun TsType.toType(): Type = when (val tsType = this) {
    is TsPrimitiveType -> when (tsType.name) {
        "unit" -> Type.unit
        "int" -> Type.int
        "bool" -> Type.bool
        "string" -> Type.string
        else -> error(message = "Bad type: $tsType")
    }
    is TsTupleType -> Type.TupleType(mappings = tsType.mappings.map { it.toType() })
    is TsFunctionType -> Type.FunctionType(
        argumentTypes = tsType.argumentTypes.map { it.toType() },
        returnType = tsType.returnType.toType()
    )
    is TsUndecidedType -> Type.undecided()
    else -> error(message = "Bad type: $tsType")
}

private object TsExpressionTransformVisitor : TsExpressionVisitor<Expression> {
    override fun visitLiteral(expression: TsLiteralExpression): Expression {
        TODO("NOT_IMPLEMENTED")
    }

    override fun visitThis(expression: TsThisExpression): Expression =
        Expression.This(range = expression.range.toRange(), type = expression.type.toType())

    override fun visitVariable(expression: TsVariableExpression): Expression =
        Expression.Variable(range = expression.range.toRange(), name = expression.name, type = expression.type.toType())

    override fun visitClassMember(expression: TsClassMemberExpression): Expression {
        TODO("NOT_IMPLEMENTED")
    }

    override fun visitTupleConstructor(expression: TsTupleConstructorExpression): Expression {
        TODO("NOT_IMPLEMENTED")
    }

    override fun visitObjectConstructor(expression: TsObjectConstructorExpression): Expression {
        TODO("NOT_IMPLEMENTED")
    }

    override fun visitVariantConstructor(expression: TsVariantConstructorExpression): Expression {
        TODO("NOT_IMPLEMENTED")
    }

    override fun visitFieldAccess(expression: TsFieldAccessExpression): Expression {
        TODO("NOT_IMPLEMENTED")
    }

    override fun visitMethodAccess(expression: TsMethodAccessExpression): Expression {
        TODO("NOT_IMPLEMENTED")
    }

    override fun visitUnary(expression: TsUnaryExpression): Expression {
        TODO("NOT_IMPLEMENTED")
    }

    override fun visitPanic(expression: TsPanicExpression): Expression {
        TODO("NOT_IMPLEMENTED")
    }

    override fun visitBuiltInFunctionCall(expression: TsBuiltInFunctionCallExpression): Expression {
        TODO("NOT_IMPLEMENTED")
    }

    override fun visitFunctionApplication(expression: TsFunctionApplicationExpression): Expression {
        TODO("NOT_IMPLEMENTED")
    }

    override fun visitBinary(expression: TsBinaryExpression): Expression {
        TODO("NOT_IMPLEMENTED")
    }

    override fun visitIfElse(expression: TsIfElseExpression): Expression {
        TODO("NOT_IMPLEMENTED")
    }

    override fun visitMatch(expression: TsMatchExpression): Expression {
        TODO("NOT_IMPLEMENTED")
    }

    override fun visitLambda(expression: TsLambdaExpression): Expression {
        TODO("NOT_IMPLEMENTED")
    }

    override fun visitStatementBlock(expression: TsStatementBlockExpression): Expression {
        TODO("NOT_IMPLEMENTED")
    }
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
