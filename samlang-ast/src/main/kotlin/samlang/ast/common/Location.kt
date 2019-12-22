package samlang.ast.common

/**
 * The location data class uniquely identifies a source location of an expression within a project.
 *
 * @param sourcePath relative path to the root of source.
 * @param range range of the expression.
 */
data class Location(val sourcePath: String, val range: Range)
