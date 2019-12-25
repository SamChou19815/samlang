package samlang.lsp

import samlang.ast.common.ModuleReference
import samlang.ast.common.Position
import samlang.ast.common.Range
import samlang.ast.common.Type

internal class LanguageServerServices(private val state: LanguageServerState) {
    fun queryType(moduleReference: ModuleReference, position: Position): Pair<Type, Range>? {
        val expression = state.locationLookup.get(moduleReference = moduleReference, position = position) ?: return null
        return expression.type to expression.range
    }
}
