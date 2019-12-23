package samlang.checker

import kotlinx.collections.immutable.PersistentMap
import kotlinx.collections.immutable.persistentMapOf
import samlang.ast.common.Type
import samlang.ast.common.TypeDefinition
import samlang.ast.lang.ClassDefinition

/**
 * A collection of all files' typing context.
 */
data class GlobalTypingContext(val files: PersistentMap<String, FileTypingContext>) {
    /**
     * All type definitions global to a file.
     */
    data class FileTypingContext(val classes: PersistentMap<String, ClassType>) {
        /**
         * @return a new context with [classDefinition]'s type definition without [classDefinition]'s members.
         * It does not check validity of types of the given [classDefinition]. If there is a collision, return `null`.
         */
        fun addClassTypeDefinition(classDefinition: ClassDefinition): FileTypingContext? {
            val name = classDefinition.name
            if (classes.containsKey(key = name)) {
                return null
            }
            val newModuleType = ClassType(
                typeDefinition = classDefinition.typeDefinition,
                functions = persistentMapOf(),
                methods = persistentMapOf()
            )
            return FileTypingContext(classes = classes.put(key = name, value = newModuleType))
        }
    }

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
