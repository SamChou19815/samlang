package samlang.lsp

import org.eclipse.lsp4j.CompletionItemKind
import samlang.ast.common.ModuleReference
import samlang.ast.common.Position
import samlang.ast.common.Range
import samlang.ast.common.Type
import samlang.ast.common.TypeDefinitionType
import samlang.ast.lang.Expression

internal class LanguageServerServices(private val state: LanguageServerState) {
    fun queryType(moduleReference: ModuleReference, position: Position): Pair<Type, Range>? {
        val expression =
            state.expressionLocationLookup.get(moduleReference = moduleReference, position = position) ?: return null
        return expression.type to expression.range
    }

    fun autoComplete(moduleReference: ModuleReference, position: Position): List<CompletionItem> {
        if (position.column < 0) {
            return emptyList()
        }
        val expression = state.expressionLocationLookup
            .get(moduleReference = moduleReference, position = position)
            ?: return emptyList()
        val classOfExpression = state.classLocationLookup
            .get(moduleReference = moduleReference, position = position)
            ?: return emptyList()
        val moduleContext = state.globalTypingContext.modules[moduleReference] ?: return emptyList()
        if (expression is Expression.ClassMember) {
            val className = expression.className
            val relevantClassType = moduleContext.getAnyClassType(className = className) ?: return emptyList()
            return relevantClassType.functions.map { (name, typeInfo) ->
                val functionType = typeInfo.type
                val detailedName = "$name${functionType.prettyPrintWithDummyArgumentName()}"
                val (text, isSnippet) = getInsertText(name = name, argumentLength = functionType.argumentTypes.size)
                CompletionItem(
                    name = detailedName,
                    text = text,
                    isSnippet = isSnippet,
                    kind = CompletionItemKind.Function,
                    type = typeInfo.toString()
                )
            }
        }
        val type = when (expression) {
            is Expression.FieldAccess -> expression.expression.type as? Type.IdentifierType ?: return emptyList()
            is Expression.MethodAccess -> expression.expression.type as? Type.IdentifierType ?: return emptyList()
            else -> return emptyList()
        }
        val relevantClassType = moduleContext.getAnyClassType(className = type.identifier) ?: return emptyList()
        val completionResults = mutableListOf<CompletionItem>()
        val isInsideClass = classOfExpression == type.identifier
        if (isInsideClass && relevantClassType.typeDefinition.type == TypeDefinitionType.OBJECT) {
            relevantClassType.typeDefinition.mappings.forEach { (name, type) ->
                completionResults += CompletionItem(
                    name = name,
                    text = name,
                    isSnippet = false,
                    kind = CompletionItemKind.Field,
                    type = type.type.toString()
                )
            }
        }
        relevantClassType.methods.forEach { (name, typeInfo) ->
            if (isInsideClass || typeInfo.isPublic) {
                val functionType = typeInfo.type
                val detailedName = "$name${functionType.prettyPrintWithDummyArgumentName()}"
                val (text, isSnippet) = getInsertText(name = name, argumentLength = functionType.argumentTypes.size)
                completionResults += CompletionItem(
                    name = detailedName,
                    text = text,
                    isSnippet = isSnippet,
                    kind = CompletionItemKind.Method,
                    type = typeInfo.toString()
                )
            }
        }
        return completionResults
    }

    private fun getInsertText(name: String, argumentLength: Int): Pair<String, Boolean> {
        if (argumentLength == 0) {
            return "$name()" to false
        }
        val detailed = (1..argumentLength).joinToString(separator = ", ", prefix = "$name(", postfix = ")\$0") { type ->
            "$$type"
        }
        return detailed to true
    }

    data class CompletionItem(
        val name: String,
        val text: String,
        val isSnippet: Boolean,
        val kind: CompletionItemKind,
        val type: String
    )
}
