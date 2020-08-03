package samlang.compiler.asm.tiling

/**
 * A tiling for an IR Node.
 *
 * @param T type of the IR node.
 */
interface IrTile<T, R : TilingResult> {
    /**
     * @param node the node to tile.
     * @param dpTiling the dp tiling class.
     * @return the tiling result, or null if it is impossible to tile this node with this tile.
     */
    fun getTilingResult(node: T, dpTiling: DpTiling): R?
}
