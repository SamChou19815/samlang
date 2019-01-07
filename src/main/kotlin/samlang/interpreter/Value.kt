package samlang.interpreter

import samlang.ast.checked.CheckedExpr

sealed class Value {

    /*
     * --------------------------------------------------------------------------------
     * Part 1: Primitive Values
     * --------------------------------------------------------------------------------
     */

    object UnitValue : Value()
    data class IntValue(val v: Long) : Value()
    data class StringValue(val v: String) : Value()
    data class BoolValue(val v: Boolean) : Value()

    /*
     * --------------------------------------------------------------------------------
     * Part 2: Compound Values
     * --------------------------------------------------------------------------------
     */

    data class TupleValue(val tupleContent: List<Value>) : Value()
    data class ObjectValue(val objectContent: Map<String, Value>) : Value()
    data class VariantValue(val tag: String, val data: Value) : Value()

    /*
     * --------------------------------------------------------------------------------
     * Part 3: Special Values
     * --------------------------------------------------------------------------------
     */

    data class FunctionValue(
        internal val arguments: List<String>,
        internal val body: CheckedExpr,
        internal var context: InterpretationContext
    ) : Value()

}
