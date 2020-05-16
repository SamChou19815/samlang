@file:Suppress("INTERFACE_WITH_SUPERCLASS", "OVERRIDING_FINAL_MEMBER", "RETURN_TYPE_MISMATCH_ON_OVERRIDE", "CONFLICTING_OVERLOADS", "EXTERNAL_DELEGATION")

import kotlin.js.*

external open class TsLiteral(type: String /* 'int' | 'string' | 'bool' */, value: String) {
    open var type: String /* 'int' | 'string' | 'bool' */
    open var value: String
}

external interface TsModuleMembersImport : TsNode {
    var importedMembers: Array<TsImportedMember>
    var importedModule: ModuleReference
    var importedModuleRange: TsRange
}

external interface TsImportedMember {
    var name: String
    var range: TsRange
}

external interface ModuleReference {
    var parts: Array<String>
}

external interface TsNode {
    var range: TsRange
}

external interface TsPosition {
    var line: Number
    var column: Number
}

external interface TsRange {
    var start: TsPosition
    var end: TsPosition
}

external interface TsStringMapElement<V> {
    var key: String
    var value: V
}

typealias TsStringMap<V> = Array<TsStringMapElement<V>>

external interface TsType {
    fun <T> accept(visitor: TypeVisitor<T>): T
}

external interface TypeVisitor<T> {
    fun visitPrimitive(type: TsPrimitiveType): T
    fun visitIdentifier(type: TsIdentifierType): T
    fun visitTuple(type: TsTupleType): T
    fun visitFunction(type: TsFunctionType): T
    fun visitUndecided(type: TsUndecidedType): T
}

external open class TsPrimitiveType(name: String /* 'unit' | 'bool' | 'int' | 'string' */) : TsType {
    open var name: String /* 'unit' | 'bool' | 'int' | 'string' */
    override fun <T> accept(visitor: TypeVisitor<T>): T
}

external open class TsIdentifierType(identifier: String, typeArguments: Array<TsType>) : TsType {
    open var identifier: String
    open var typeArguments: Array<TsType>
    override fun <T> accept(visitor: TypeVisitor<T>): T
}

external open class TsTupleType(mappings: Array<TsType>) : TsType {
    open var mappings: Array<TsType>
    override fun <T> accept(visitor: TypeVisitor<T>): T
}

external open class TsFunctionType(argumentTypes: Array<TsType>, returnType: TsType) : TsType {
    open var argumentTypes: Array<TsType>
    open var returnType: TsType
    override fun <T> accept(visitor: TypeVisitor<T>): T
}

external open class TsUndecidedType : TsType {
    override fun <T> accept(visitor: TypeVisitor<T>): T
}

external interface TsTypeDefinition : TsNode {
    var type: String /* 'object' | 'variant' */
    var typeParameters: Array<String>
    var names: Array<String>
    var mappings: TsStringMap<TsFieldType>
}

external interface TsFieldType {
    var type: TsType
    var isPublic: Boolean
}

external interface TsClassDefinition : TsNode {
    var nameRange: TsRange
    var name: String
    var isPublic: Boolean
    var typeDefinition: TsTypeDefinition
    var members: Array<TsMemberDefinition>
}

external interface TsMemberDefinition : TsNode {
    var isPublic: Boolean
    var isMethod: Boolean
    var nameRange: TsRange
    var name: String
    var typeParameters: Array<String>
    var type: TsFunctionType
    var parameters: Array<TsMemberDefinitionParameter>
    var body: TsExpression
}

external interface TsMemberDefinitionParameter {
    var name: String
    var nameRange: TsRange
    var type: TsType
    var typeRange: TsRange
}

external interface TsExpression : TsNode {
    var type: TsType
    fun <T> accept(visitor: TsExpressionVisitor<T>): T
}

external interface TsExpressionVisitor<T> {
    fun visitLiteral(expression: TsLiteralExpression): T
    fun visitThis(expression: TsThisExpression): T
    fun visitVariable(expression: TsVariableExpression): T
    fun visitClassMember(expression: TsClassMemberExpression): T
    fun visitTupleConstructor(expression: TsTupleConstructorExpression): T
    fun visitObjectConstructor(expression: TsObjectConstructorExpression): T
    fun visitVariantConstructor(expression: TsVariantConstructorExpression): T
    fun visitFieldAccess(expression: TsFieldAccessExpression): T
    fun visitMethodAccess(expression: TsMethodAccessExpression): T
    fun visitUnary(expression: TsUnaryExpression): T
    fun visitPanic(expression: TsPanicExpression): T
    fun visitBuiltInFunctionCall(expression: TsBuiltInFunctionCallExpression): T
    fun visitFunctionApplication(expression: TsFunctionApplicationExpression): T
    fun visitBinary(expression: TsBinaryExpression): T
    fun visitIfElse(expression: TsIfElseExpression): T
    fun visitMatch(expression: TsMatchExpression): T
    fun visitLambda(expression: TsLambdaExpression): T
    fun visitStatementBlock(expression: TsStatementBlockExpression): T
}

external open class TsLiteralExpression(range: TsRange, type: TsType, literal: TsLiteral) : TsExpression {
    override var range: TsRange
    override var type: TsType
    open var literal: TsLiteral
    override fun <T> accept(visitor: TsExpressionVisitor<T>): T
}

external open class TsThisExpression(range: TsRange, type: TsType) : TsExpression {
    override var range: TsRange
    override var type: TsType
    override fun <T> accept(visitor: TsExpressionVisitor<T>): T
}

external open class TsVariableExpression(range: TsRange, type: TsType, name: String) : TsExpression {
    override var range: TsRange
    override var type: TsType
    open var name: String
    override fun <T> accept(visitor: TsExpressionVisitor<T>): T
}

external open class TsClassMemberExpression(range: TsRange, type: TsType, typeArguments: Array<TsType>, className: String, classNameRange: TsRange, memberName: String) : TsExpression {
    override var range: TsRange
    override var type: TsType
    open var typeArguments: Array<TsType>
    open var className: String
    open var classNameRange: TsRange
    open var memberName: String
    override fun <T> accept(visitor: TsExpressionVisitor<T>): T
}

external open class TsTupleConstructorExpression(range: TsRange, type: TsType, expressionList: Array<TsExpression>) : TsExpression {
    override var range: TsRange
    override var type: TsType
    open var expressionList: Array<TsExpression>
    override fun <T> accept(visitor: TsExpressionVisitor<T>): T
}

external open class TsObjectConstructorExpression(range: TsRange, type: TsType, fieldDeclarations: Array<TsFieldConstructor>) : TsExpression {
    override var range: TsRange
    override var type: TsType
    open var fieldDeclarations: Array<TsFieldConstructor>
    override fun <T> accept(visitor: TsExpressionVisitor<T>): T
}

external interface TsFieldConstructor {
    var range: TsRange
    var type: TsType
    var name: String
    var expression: TsExpression?
        get() = definedExternally
        set(value) = definedExternally
}

external open class TsVariantConstructorExpression(range: TsRange, type: TsType, tag: String, tagOrder: Number, data: TsExpression) : TsExpression {
    override var range: TsRange
    override var type: TsType
    open var tag: String
    open var tagOrder: Number
    open var data: TsExpression
    override fun <T> accept(visitor: TsExpressionVisitor<T>): T
}

external open class TsFieldAccessExpression(range: TsRange, type: TsType, expression: TsExpression, fieldName: String, fieldOrder: Number) : TsExpression {
    override var range: TsRange
    override var type: TsType
    open var expression: TsExpression
    open var fieldName: String
    open var fieldOrder: Number
    override fun <T> accept(visitor: TsExpressionVisitor<T>): T
}

external open class TsMethodAccessExpression(range: TsRange, type: TsType, expression: TsExpression, methodName: String) : TsExpression {
    override var range: TsRange
    override var type: TsType
    open var expression: TsExpression
    open var methodName: String
    override fun <T> accept(visitor: TsExpressionVisitor<T>): T
}

external open class TsUnaryExpression(range: TsRange, type: TsType, operator: String /* '!' | '-' */, expression: TsExpression) : TsExpression {
    override var range: TsRange
    override var type: TsType
    open var operator: String /* '!' | '-' */
    open var expression: TsExpression
    override fun <T> accept(visitor: TsExpressionVisitor<T>): T
}

external open class TsPanicExpression(range: TsRange, type: TsType, expression: TsExpression) : TsExpression {
    override var range: TsRange
    override var type: TsType
    open var expression: TsExpression
    override fun <T> accept(visitor: TsExpressionVisitor<T>): T
}

external open class TsBuiltInFunctionCallExpression(range: TsRange, type: TsType, functionName: String /* 'stringToInt' | 'intToString' | 'println' */, argumentExpression: TsExpression) : TsExpression {
    override var range: TsRange
    override var type: TsType
    open var functionName: String /* 'stringToInt' | 'intToString' | 'println' */
    open var argumentExpression: TsExpression
    override fun <T> accept(visitor: TsExpressionVisitor<T>): T
}

external open class TsFunctionApplicationExpression(range: TsRange, type: TsType, functionExpression: TsExpression, functionArguments: Array<TsExpression>) : TsExpression {
    override var range: TsRange
    override var type: TsType
    open var functionExpression: TsExpression
    open var functionArguments: Array<TsExpression>
    override fun <T> accept(visitor: TsExpressionVisitor<T>): T
}

external open class TsBinaryExpression(range: TsRange, type: TsType, e1: TsExpression, operator: String /* '*' | '/' | '%' | '+' | '-' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||' | '::' */, e2: TsExpression) : TsExpression {
    override var range: TsRange
    override var type: TsType
    open var e1: TsExpression
    open var operator: String /* '*' | '/' | '%' | '+' | '-' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||' | '::' */
    open var e2: TsExpression
    override fun <T> accept(visitor: TsExpressionVisitor<T>): T
}

external open class TsIfElseExpression(range: TsRange, type: TsType, boolExpression: TsExpression, e1: TsExpression, e2: TsExpression) : TsExpression {
    override var range: TsRange
    override var type: TsType
    open var boolExpression: TsExpression
    open var e1: TsExpression
    open var e2: TsExpression
    override fun <T> accept(visitor: TsExpressionVisitor<T>): T
}

external open class TsMatchExpression(range: TsRange, type: TsType, matchedExpression: TsExpression, matchingList: Array<TsVariantPatternToExpr>) : TsExpression {
    override var range: TsRange
    override var type: TsType
    open var matchedExpression: TsExpression
    open var matchingList: Array<TsVariantPatternToExpr>
    override fun <T> accept(visitor: TsExpressionVisitor<T>): T
}

external interface TsVariantPatternToExpr {
    var range: TsRange
    var tag: String
    var tagOrder: Number
    var dataVariable: String?
        get() = definedExternally
        set(value) = definedExternally
    var expression: TsExpression
}

external open class TsLambdaExpression(range: TsRange, type: TsType, parameters: Array<NameType>, body: TsExpression) : TsExpression {
    override var range: TsRange
    override var type: TsType
    open var parameters: Array<NameType>
    open var body: TsExpression
    override fun <T> accept(visitor: TsExpressionVisitor<T>): T
}

external interface NameType {
    var name: String
    var type: TsType
}

external open class TsStatementBlockExpression(range: TsRange, type: TsType, block: TsStatementBlock) : TsExpression {
    override var range: TsRange
    override var type: TsType
    open var block: TsStatementBlock
    override fun <T> accept(visitor: TsExpressionVisitor<T>): T
}

external interface TsModule {
    var imports: Array<TsModuleMembersImport>
    var classDefinitions: Array<TsClassDefinition>
}

external interface TsPattern {
    var range: TsRange
    fun <T> accept(visitor: TsPatternVisitor<T>): T
}

external interface TsPatternVisitor<T> {
    fun visitTuple(pattern: TsTuplePattern): T
    fun visitObject(pattern: TsObjectPattern): T
    fun visitVariable(pattern: TsVariablePattern): T
    fun visitWildcard(pattern: TsWildCardPattern): T
}

external open class TsTuplePattern(range: TsRange, destructedNames: Array<TsTupleDestructedName>) : TsPattern {
    override var range: TsRange
    open var destructedNames: Array<TsTupleDestructedName>
    override fun <T> accept(visitor: TsPatternVisitor<T>): T
}

external interface TsTupleDestructedName {
    var name: String?
        get() = definedExternally
        set(value) = definedExternally
    var range: TsRange
}

external open class TsObjectPattern(range: TsRange, destructedNames: Array<TsObjectDestructedName>) : TsPattern {
    override var range: TsRange
    open var destructedNames: Array<TsObjectDestructedName>
    override fun <T> accept(visitor: TsPatternVisitor<T>): T
}

external interface TsObjectDestructedName {
    var fieldName: String
    var fieldOrder: Number
    var alias: String?
        get() = definedExternally
        set(value) = definedExternally
    var range: TsRange
}

external open class TsVariablePattern(range: TsRange, name: String) : TsPattern {
    override var range: TsRange
    open var name: String
    override fun <T> accept(visitor: TsPatternVisitor<T>): T
}

external open class TsWildCardPattern(range: TsRange) : TsPattern {
    override var range: TsRange
    override fun <T> accept(visitor: TsPatternVisitor<T>): T
}

external open class TsValStatement(range: TsRange, pattern: TsPattern, typeAnnotation: TsType, assignedExpression: TsExpression) : TsNode {
    override var range: TsRange
    open var pattern: TsPattern
    open var typeAnnotation: TsType
    open var assignedExpression: TsExpression
}

external open class TsStatementBlock(range: TsRange, statements: Array<TsValStatement>, expression: TsExpression? = definedExternally) : TsNode {
    override var range: TsRange
    open var statements: Array<TsValStatement>
    open var expression: TsExpression?
}
