@file:Suppress("INTERFACE_WITH_SUPERCLASS", "OVERRIDING_FINAL_MEMBER", "RETURN_TYPE_MISMATCH_ON_OVERRIDE", "CONFLICTING_OVERLOADS", "EXTERNAL_DELEGATION")
package tsstdlib

import kotlin.js.*

external interface ConcatArray<T> {
    var length: Number
    fun join(separator: String = definedExternally): String
    fun slice(start: Number = definedExternally, end: Number = definedExternally): Array<T>
}

@Suppress("NOTHING_TO_INLINE")
inline operator fun <T> ConcatArray<T>.get(n: Number): T? = asDynamic()[n]

@Suppress("NOTHING_TO_INLINE")
inline operator fun <T> ConcatArray<T>.set(n: Number, value: T) {
    asDynamic()[n] = value
}
