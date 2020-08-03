package samlang.compiler.asm.tiling

import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrStatement

/** @param T type of the IR node. */
internal interface IrTile<T, R : TilingResult> {
    /**
     * @param node the node to tile.
     * @param dpTiling the dp tiling class.
     * @return the tiling result, or null if it is impossible to tile this node with this tile.
     */
    fun getTilingResult(node: T, dpTiling: DpTiling): R?
}

/** A tile for IR statements. */
internal interface IrStatementTile<T : MidIrStatement> : IrTile<T, StatementTilingResult>

/** A tile for IR expressions. */
internal interface IrExpressionTile<T : MidIrExpression> : IrTile<T, ExpressionTilingResult>
