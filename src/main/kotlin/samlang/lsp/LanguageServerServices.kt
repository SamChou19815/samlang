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
        val expression = state.locationLookup.get(moduleReference = moduleReference, position = position) ?: return null
        return expression.type to expression.range
    }

    fun autoComplete(moduleReference: ModuleReference, position: Position): List<CompletionItem> {
        if (position.column < 0) {
            return emptyList()
        }
        val expression = state.locationLookup
            .get(moduleReference = moduleReference, position = position)
            ?: return emptyList()
        val moduleContext = state.globalTypingContext.modules[moduleReference] ?: return emptyList()
        if (expression is Expression.ClassMember) {
            val className = expression.className
            val relevantClassType = moduleContext.getAnyClassType(className = className) ?: return emptyList()
            return relevantClassType.functions.map { (name, typeInfo) ->
                CompletionItem(name = name, kind = CompletionItemKind.Function, type = typeInfo.toString())
            }
        }
        val type = when (expression) {
            is Expression.FieldAccess -> expression.expression.type as? Type.IdentifierType ?: return emptyList()
            is Expression.MethodAccess -> expression.expression.type as? Type.IdentifierType ?: return emptyList()
            else -> return emptyList()
        }
        val relevantClassType = moduleContext.getAnyClassType(className = type.identifier) ?: return emptyList()
        val completionResults = arrayListOf<CompletionItem>()
        if (relevantClassType.typeDefinition.type == TypeDefinitionType.OBJECT) {
            relevantClassType.typeDefinition.mappings.forEach { (name, type) ->
                completionResults.add(
                    element = CompletionItem(name = name, kind = CompletionItemKind.Field, type = type.toString())
                )
            }
        }
        relevantClassType.methods.forEach { (name, typeInfo) ->
            completionResults.add(
                element = CompletionItem(name = name, kind = CompletionItemKind.Method, type = typeInfo.toString())
            )
        }
        return completionResults
    }

    data class CompletionItem(val name: String, val kind: CompletionItemKind, val type: String)
}
