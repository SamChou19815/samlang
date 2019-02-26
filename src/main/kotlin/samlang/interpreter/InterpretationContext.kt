package samlang.interpreter

import kotlinx.collections.immutable.ImmutableMap
import kotlinx.collections.immutable.immutableMapOf

/**
 * Context for interpretation. It stores the previously computed values and references.
 *
 * @param modules the modules that can be used as reference.
 * @param localValues the local values computed inside a function.
 */
data class InterpretationContext(
    val modules: ImmutableMap<String, ModuleValue>,
    val localValues: ImmutableMap<String, Value>
) {

    /**
     * The context for one module.
     *
     * @param functions all the defined static functions inside the modules.
     * @param methods all the defined instance methods inside the modules.
     */
    data class ModuleValue(
        val functions: Map<String, Value.FunctionValue>,
        val methods: Map<String, Value.FunctionValue>
    )

    companion object {

        /**
         * An empty interpretation context. Used for initial setup for interpreter.
         */
        val EMPTY: InterpretationContext = InterpretationContext(
            modules = immutableMapOf(), localValues = immutableMapOf()
        )

    }

}
