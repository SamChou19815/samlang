package samlang.interpreter

import kotlinx.collections.immutable.ImmutableMap
import kotlinx.collections.immutable.immutableMapOf

/**
 * Context for interpretation. It stores the previously computed values and references.
 *
 * @param classes the class definitions that can be used as reference.
 * @param localValues the local values computed inside a function.
 */
data class InterpretationContext(
    val classes: ImmutableMap<String, ClassValue>,
    val localValues: ImmutableMap<String, Value>
) {

    /**
     * The context for one class.
     *
     * @param functions all the defined static functions inside the class definition.
     * @param methods all the defined instance methods inside the class definition.
     */
    data class ClassValue(
        val functions: Map<String, Value.FunctionValue>,
        val methods: Map<String, Value.FunctionValue>
    )

    companion object {

        /**
         * An empty interpretation context. Used for initial setup for interpreter.
         */
        val EMPTY: InterpretationContext = InterpretationContext(
            classes = immutableMapOf(), localValues = immutableMapOf()
        )
    }
}
