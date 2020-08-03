package samlang.compiler.asm.tiling

import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.Companion.COMMENT
import samlang.ast.asm.AssemblyInstruction.Companion.LEA
import samlang.ast.mir.MidIrExpression

/** A tiling for op that tried to use LEA. */
internal object TileOpByLEA : IrExpressionTile<MidIrExpression.Op> {
    override fun getTilingResult(
        node: MidIrExpression.Op,
        dpTiling: DpTiling
    ): ExpressionTilingResult? {
        val resultReg = dpTiling.context.nextReg()
        // try to use LEA if we can
        val (instructions1, mem) = MemTilingHelper.tileExprForMem(node, dpTiling) ?: return null
        val instructions = mutableListOf<AssemblyInstruction>()
        instructions += COMMENT(comment = node)
        instructions += instructions1
        instructions += LEA(dest = resultReg, src = mem)
        return ExpressionTilingResult(instructions, resultReg)
    }
}
