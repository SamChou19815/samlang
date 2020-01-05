package samlang.checker

import kotlinx.collections.immutable.PersistentMap
import samlang.ast.common.Type

internal data class LocalTypingContext(private val localValues: PersistentMap<String, Type>) {
    fun getLocalValueType(name: String): Type? = localValues[name]

    fun addLocalValueType(name: String, type: Type, onCollision: () -> Unit): LocalTypingContext {
        if (localValues.containsKey(name)) {
            onCollision()
            return this
        }
        return copy(localValues = localValues.put(key = name, value = type))
    }
}
