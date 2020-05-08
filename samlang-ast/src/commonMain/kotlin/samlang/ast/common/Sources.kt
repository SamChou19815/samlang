package samlang.ast.common

/**
 * A mapping of module reference to actual module definitions, parameterized by module type.
 *
 * @param M type of the module.
 */
data class Sources<M>(val moduleMappings: Map<ModuleReference, M>)
