@file:Suppress("INTERFACE_WITH_SUPERCLASS", "OVERRIDING_FINAL_MEMBER", "RETURN_TYPE_MISMATCH_ON_OVERRIDE", "CONFLICTING_OVERLOADS", "EXTERNAL_DELEGATION")

import kotlin.js.*
import tsstdlib.Map

external interface Literal

external interface ModuleMembersImport : Node {
    var importedMembers: Array<ImportedMember>
    var importedModule: ModuleReference
    var importedModuleRange: Range
}

external interface ImportedMember {
    var name: String
    var range: Range
}

external interface ModuleReference {
    var parts: Array<String>
}

external interface Node {
    var range: Range
}

external interface Position {
    var line: Number
    var column: Number
}

external interface Range {
    var start: Position
    var end: Position
}

external interface Type {
    fun <T> accept(visitor: TypeVisitor<T>): T
}

external interface TypeVisitor<T> {
    fun visitPrimitive(type: PrimitiveType): T
    fun visitIdentifier(type: IdentifierType): T
    fun visitTuple(type: TupleType): T
    fun visitFunction(type: FunctionType): T
    fun visitUndecided(type: UndecidedType): T
}

external open class PrimitiveType(name: String /* 'unit' | 'bool' | 'int' | 'string' */) : Type {
    open var name: String /* 'unit' | 'bool' | 'int' | 'string' */
    override fun <T> accept(visitor: TypeVisitor<T>): T
}

external open class IdentifierType(identifier: String, typeArguments: Array<Type>) : Type {
    open var identifier: String
    open var typeArguments: Array<Type>
    override fun <T> accept(visitor: TypeVisitor<T>): T
}

external open class TupleType(mappings: Array<Type>) : Type {
    open var mappings: Array<Type>
    override fun <T> accept(visitor: TypeVisitor<T>): T
}

external open class FunctionType(argumentTypes: Array<Type>, returnType: Type) : Type {
    open var argumentTypes: Array<Type>
    open var returnType: Type
    override fun <T> accept(visitor: TypeVisitor<T>): T
}

external open class UndecidedType : Type {
    override fun <T> accept(visitor: TypeVisitor<T>): T
}

external interface TypeDefinition : Node {
    var type: String /* 'object' | 'variant' */
    var typeParameters: Array<String>
    var names: Array<String>
    var mappings: Map<String, FieldType>
}

external interface FieldType {
    var type: Type
    var isPublic: Boolean
}

external interface ClassDefinition : Node {
    var nameRange: Range
    var name: String
    var isPublic: Boolean
    var typeDefinition: TypeDefinition
    var members: Array<MemberDefinition>
}

external interface MemberDefinition : Node {
    var isPublic: Boolean
    var isMethod: Boolean
    var nameRange: Range
    var name: String
    var typeParameters: Array<String>
    var type: FunctionType
    var parameters: Array<MemberDefinitionParameter>
    var body: Expression
}

external interface MemberDefinitionParameter {
    var name: String
    var nameRange: Range
    var type: Type
    var typeRange: Range
}

external interface Expression : Node {
    val type: Type
    fun <T> accept(visitor: ExpressionVisitor<T>): T
}

external interface ExpressionVisitor<T> {
    fun visitLiteral(expression: LiteralExpression): T
    fun visitThis(expression: ThisExpression): T
    fun visitVariable(expression: VariableExpression): T
    fun visitClassMember(expression: ClassMemberExpression): T
    fun visitTupleConstructor(expression: TupleConstructorExpression): T
    fun visitObjectConstructor(expression: ObjectConstructorExpression): T
    fun visitVariantConstructor(expression: VariantConstructorExpression): T
    fun visitFieldAccess(expression: FieldAccessExpression): T
    fun visitMethodAccess(expression: MethodAccessExpression): T
    fun visitUnary(expression: UnaryExpression): T
    fun visitPanic(expression: PanicExpression): T
    fun visitBuiltInFunctionCall(expression: BuiltInFunctionCallExpression): T
    fun visitFunctionApplication(expression: FunctionApplicationExpression): T
    fun visitBinary(expression: BinaryExpression): T
    fun visitIfElse(expression: IfElseExpression): T
    fun visitMatch(expression: MatchExpression): T
    fun visitLambda(expression: LambdaExpression): T
    fun visitStatementBlock(expression: StatementBlockExpression): T
}

external open class LiteralExpression(range: Range, type: Type, literal: Literal) : Expression {
    override var range: Range
    override val type: Type
    open var literal: Literal
    override fun <T> accept(visitor: ExpressionVisitor<T>): T
}

external open class ThisExpression(range: Range, type: Type) : Expression {
    override var range: Range
    override val type: Type
    override fun <T> accept(visitor: ExpressionVisitor<T>): T
}

external open class VariableExpression(range: Range, type: Type, name: String) : Expression {
    override var range: Range
    override val type: Type
    open var name: String
    override fun <T> accept(visitor: ExpressionVisitor<T>): T
}

external open class ClassMemberExpression(range: Range, type: Type, typeArguments: Array<Type>, className: String, classNameRange: Range, memberName: String) : Expression {
    override var range: Range
    override val type: Type
    open var typeArguments: Array<Type>
    open var className: String
    open var classNameRange: Range
    open var memberName: String
    override fun <T> accept(visitor: ExpressionVisitor<T>): T
}

external open class TupleConstructorExpression(range: Range, type: TupleType, expressionList: Array<Expression>) : Expression {
    override var range: Range
    override val type: TupleType
    open var expressionList: Array<Expression>
    override fun <T> accept(visitor: ExpressionVisitor<T>): T
}

external open class ObjectConstructorExpression(range: Range, type: Type, fieldDeclarations: Array<FieldConstructor>) : Expression {
    override var range: Range
    override val type: Type
    open var fieldDeclarations: Array<FieldConstructor>
    override fun <T> accept(visitor: ExpressionVisitor<T>): T
}

external interface FieldConstructor {
    var range: Range
    var type: Type
    var name: String
}

external open class VariantConstructorExpression(range: Range, type: Type, tag: String, tagOrder: Number, data: Expression) : Expression {
    override var range: Range
    override val type: Type
    open var tag: String
    open var tagOrder: Number
    open var data: Expression
    override fun <T> accept(visitor: ExpressionVisitor<T>): T
}

external open class FieldAccessExpression(range: Range, type: Type, expression: Expression, fieldName: String, fieldOrder: Number) : Expression {
    override var range: Range
    override val type: Type
    open var expression: Expression
    open var fieldName: String
    open var fieldOrder: Number
    override fun <T> accept(visitor: ExpressionVisitor<T>): T
}

external open class MethodAccessExpression(range: Range, type: Type, expression: Expression, methodName: String) : Expression {
    override var range: Range
    override val type: Type
    open var expression: Expression
    open var methodName: String
    override fun <T> accept(visitor: ExpressionVisitor<T>): T
}

external open class UnaryExpression(range: Range, type: Type, operator: String /* '!' | '-' */, expression: Expression) : Expression {
    override var range: Range
    override val type: Type
    open var operator: String /* '!' | '-' */
    open var expression: Expression
    override fun <T> accept(visitor: ExpressionVisitor<T>): T
}

external open class PanicExpression(range: Range, type: Type, expression: Expression) : Expression {
    override var range: Range
    override val type: Type
    open var expression: Expression
    override fun <T> accept(visitor: ExpressionVisitor<T>): T
}

external open class BuiltInFunctionCallExpression(range: Range, type: Type, functionName: String /* 'stringToInt' | 'intToString' | 'println' */, argumentExpression: Expression) : Expression {
    override var range: Range
    override val type: Type
    open var functionName: String /* 'stringToInt' | 'intToString' | 'println' */
    open var argumentExpression: Expression
    override fun <T> accept(visitor: ExpressionVisitor<T>): T
}

external open class FunctionApplicationExpression(range: Range, type: Type, functionExpression: Expression, functionArguments: Array<Expression>) : Expression {
    override var range: Range
    override val type: Type
    open var functionExpression: Expression
    open var functionArguments: Array<Expression>
    override fun <T> accept(visitor: ExpressionVisitor<T>): T
}

external open class BinaryExpression(range: Range, type: Type, e1: Expression, operator: String /* '*' | '/' | '%' | '+' | '-' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||' | '::' */, e2: Expression) : Expression {
    override var range: Range
    override val type: Type
    open var e1: Expression
    open var operator: String /* '*' | '/' | '%' | '+' | '-' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||' | '::' */
    open var e2: Expression
    override fun <T> accept(visitor: ExpressionVisitor<T>): T
}

external open class IfElseExpression(range: Range, type: Type, boolExpression: Expression, e1: Expression, e2: Expression) : Expression {
    override var range: Range
    override val type: Type
    open var boolExpression: Expression
    open var e1: Expression
    open var e2: Expression
    override fun <T> accept(visitor: ExpressionVisitor<T>): T
}

external open class MatchExpression(range: Range, type: Type, matchedExpression: Expression, matchingList: Array<VariantPatternToExpr>) : Expression {
    override var range: Range
    override val type: Type
    open var matchedExpression: Expression
    open var matchingList: Array<VariantPatternToExpr>
    override fun <T> accept(visitor: ExpressionVisitor<T>): T
}

external interface VariantPatternToExpr {
    var range: Range
    var tag: String
    var tagOrder: Number
    var dataVariable: String?
        get() = definedExternally
        set(value) = definedExternally
    var expression: Expression
}

external open class LambdaExpression(range: Range, type: FunctionType, parameters: Array<NameType>, captured: Map<String, Type>, body: Expression) : Expression {
    override var range: Range
    override val type: FunctionType
    open var parameters: Array<NameType>
    open var captured: Map<String, Type>
    open var body: Expression
    override fun <T> accept(visitor: ExpressionVisitor<T>): T
}

external interface NameType {
    var name: String
    var type: Type
}

external open class StatementBlockExpression(range: Range, type: Type, block: StatementBlock) : Expression {
    override var range: Range
    override val type: Type
    open var block: StatementBlock
    override fun <T> accept(visitor: ExpressionVisitor<T>): T
}

external interface Module {
    var imports: Array<ModuleMembersImport>
    var classDefinitions: Array<ClassDefinition>
}

external interface Pattern {
    var range: Range
}

external open class ValStatement(range: Range, pattern: Pattern, typeAnnotation: Type, assignedExpression: Expression) : Node {
    override var range: Range
    open var pattern: Pattern
    open var typeAnnotation: Type
    open var assignedExpression: Expression
}

external open class StatementBlock(range: Range, statements: Array<ValStatement>, expression: Expression? = definedExternally) : Node {
    override var range: Range
    open var statements: Array<ValStatement>
    open var expression: Expression?
}
