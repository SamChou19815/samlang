package samlang.lsp

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

    fun autoComplete(moduleReference: ModuleReference, position: Position): List<Pair<String, Type>> {
        val queryPosition = position.copy(column = position.column - 1)
        if (position.column < 0) {
            return emptyList()
        }
        val expression = state.locationLookup
            .get(moduleReference = moduleReference, position = queryPosition)
            ?: return emptyList()
        val type = expression.type as? Type.IdentifierType ?: return emptyList()
        val moduleContext = state.globalTypingContext.modules[moduleReference] ?: return emptyList()
        val relevantClassType = moduleContext.definedClasses[type.identifier]
            ?: moduleContext.importedClasses[type.identifier]
            ?: return emptyList()
        if (relevantClassType.typeDefinition.type != TypeDefinitionType.OBJECT) {
            return emptyList()
        }
        return relevantClassType.typeDefinition.mappings.map { (name, type) -> name to type }
    }
}
