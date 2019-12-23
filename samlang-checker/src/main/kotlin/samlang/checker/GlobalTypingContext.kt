package samlang.checker

import kotlinx.collections.immutable.PersistentMap
import samlang.ast.common.ModuleReference
import samlang.ast.common.Type
import samlang.ast.common.TypeDefinition

/**
 * A collection of all modules' typing context.
 */
data class GlobalTypingContext(val modules: PersistentMap<ModuleReference, ModuleTypingContext>) {
    /**
     * All type definitions global to a module.
     */
    data class ModuleTypingContext(
        val definedClasses: PersistentMap<String, ClassType>,
        val importedClasses: PersistentMap<String, ClassType>
    )

    /**
     * Typing information for a class.
     */
    data class ClassType(
        val typeDefinition: TypeDefinition,
        val functions: PersistentMap<String, TypeInfo>,
        val methods: PersistentMap<String, TypeInfo>
    )

    /**
     * Typing information for a function.
     */
    data class TypeInfo(val isPublic: Boolean, val typeParams: List<String>?, val type: Type.FunctionType)
}
