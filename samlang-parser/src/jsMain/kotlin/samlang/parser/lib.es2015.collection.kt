@file:Suppress("INTERFACE_WITH_SUPERCLASS", "OVERRIDING_FINAL_MEMBER", "RETURN_TYPE_MISMATCH_ON_OVERRIDE", "CONFLICTING_OVERLOADS", "EXTERNAL_DELEGATION")
package tsstdlib

import kotlin.js.*

external interface Map<K, V> {
    fun entries(): IterableIterator<dynamic /* JsTuple<K, V> */>
    fun keys(): IterableIterator<K>
    fun values(): IterableIterator<V>
    fun clear()
    fun delete(key: K): Boolean
    fun forEach(callbackfn: (value: V, key: K, map: Map<K, V>) -> Unit, thisArg: Any = definedExternally)
    fun get(key: K): V?
    fun has(key: K): Boolean
    fun set(key: K, value: V): Map<K, V> /* this */
    var size: Number
}

external interface MapConstructor {
    var prototype: Map<Any, Any>
}
