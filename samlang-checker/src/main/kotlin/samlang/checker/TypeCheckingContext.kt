package samlang.checker

import kotlinx.collections.immutable.PersistentMap
import samlang.ast.common.Type

data class TypeCheckingContext(private val localValues: PersistentMap<String, Type>) {
    fun getLocalValueType(name: String): Type? = localValues[name]

    fun addLocalValueType(name: String, type: Type, onCollision: () -> Unit): TypeCheckingContext {
        if (localValues.containsKey(name)) {
            onCollision()
            return this
        }
        return copy(localValues = localValues.put(key = name, value = type))
    }
}
