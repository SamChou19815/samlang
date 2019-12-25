package samlang.lsp

import org.eclipse.lsp4j.CompletionItemKind
import samlang.ast.common.ModuleReference
import samlang.ast.common.Position
import samlang.ast.common.Range
import samlang.ast.common.Type
import samlang.ast.common.TypeDefinitionType

internal class LanguageServerServices(private val state: LanguageServerState) {
    fun queryType(moduleReference: ModuleReference, position: Position): Pair<Type, Range>? {
        val expression = state.locationLookup.get(moduleReference = moduleReference, position = position) ?: return null
        return expression.type to expression.range
    }

    fun autoComplete(moduleReference: ModuleReference, position: Position): List<CompletionItem> {
        val queryPosition = position.copy(column = position.column - 1)
        if (position.column < 0) {
            return emptyList()
        }
        val expression = state.locationLookup
            .get(moduleReference = moduleReference, position = queryPosition)
            ?: return emptyList()
        val type = expression.type as? Type.IdentifierType ?: return emptyList()
        val moduleContext = state.globalTypingContext.modules[moduleReference] ?: return emptyList()
        if (type.identifier.startsWith(prefix = "class ")) {
            val className = type.identifier.substring(startIndex = 6)
            val relevantClassType = moduleContext.getAnyClassType(className = className) ?: return emptyList()
            return relevantClassType.functions.map { (name, typeInfo) ->
                CompletionItem(name = name, kind = CompletionItemKind.Function, type = typeInfo.toString())
            }
        }
        val relevantClassType = moduleContext.getAnyClassType(className = type.identifier) ?: return emptyList()
        if (relevantClassType.typeDefinition.type != TypeDefinitionType.OBJECT) {
            return emptyList()
        }
        return relevantClassType.typeDefinition.mappings.map { (name, type) ->
            CompletionItem(name = name, kind = CompletionItemKind.Field, type = type.toString())
        }
    }

    data class CompletionItem(val name: String, val kind: CompletionItemKind, val type: String)
}
