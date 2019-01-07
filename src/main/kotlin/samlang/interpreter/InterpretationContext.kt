package samlang.interpreter

import kotlinx.collections.immutable.ImmutableMap
import kotlinx.collections.immutable.immutableMapOf

data class InterpretationContext(
    val modules: ImmutableMap<String, ModuleValue>,
    val localValues: ImmutableMap<String, Value>
) {

    data class ModuleValue(
        val functions: Map<String, Value.FunctionValue>,
        val methods: Map<String, Value.FunctionValue>
    )

    companion object {

        val EMPTY: InterpretationContext = InterpretationContext(
            modules = immutableMapOf(), localValues = immutableMapOf()
        )

    }

}
