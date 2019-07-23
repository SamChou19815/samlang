package samlang.ast

/**
 * A common interface for all AST nodes.
 */
interface Node {
    /**
     * The range of the entire node.
     */
    val range: Range
}
