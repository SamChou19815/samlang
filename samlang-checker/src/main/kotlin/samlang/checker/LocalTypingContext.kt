package samlang.checker

import samlang.ast.common.Type

internal class LocalTypingContext {
    private val stacks: MutableList<ContextLayer> = mutableListOf(ContextLayer())

    fun getLocalValueType(name: String): Type? {
        val closestStackType = stacks.last().getLocalValueType(name = name)
        if (closestStackType != null) {
            return closestStackType
        }
        for (level in (stacks.size - 2) downTo 0) {
            val stack = stacks[level]
            val type = stack.getLocalValueType(name = name)
            if (type != null) {
                return type
            }
        }
        return null
    }

    fun addLocalValueType(name: String, type: Type, onCollision: () -> Unit) {
        for (level in 0 until (stacks.size - 2)) {
            val previousLevelType = stacks[level].getLocalValueType(name = name)
            if (previousLevelType != null) {
                onCollision()
                return
            }
        }
        stacks.last().addLocalValueType(name = name, type = type, onCollision = onCollision)
    }

    fun removeLocalValue(name: String) {
        stacks.last().removeLocalValue(name = name)
    }

    fun <T> withNestedScope(block: () -> T): T {
        stacks += ContextLayer()
        val result = block()
        stacks.removeAt(index = stacks.size - 1)
        return result
    }

    /** One layer of the typing context. We should stack a new layer when encounter a new nested scope. */
    private class ContextLayer(private val localValues: MutableMap<String, Type> = mutableMapOf()) {
        fun getLocalValueType(name: String): Type? = localValues[name]

        fun addLocalValueType(name: String, type: Type, onCollision: () -> Unit) {
            if (localValues.containsKey(name)) {
                onCollision()
                return
            }
            localValues[name] = type
        }

        fun removeLocalValue(name: String) {
            require(value = localValues.remove(key = name) != null)
        }
    }
}
