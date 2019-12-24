package samlang.ast.common

/**
 * The location data class uniquely identifies a source location of an expression within a project.
 *
 * @param moduleReference the module where the expression is in.
 * @param range range of the expression.
 */
data class Location(val moduleReference: ModuleReference, val range: Range)
