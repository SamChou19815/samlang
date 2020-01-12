package samlang.compiler.asm.tiling

import samlang.ast.asm.AssemblyArgs.REG
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.Companion.COMMENT
import samlang.ast.asm.AssemblyInstruction.Companion.MOVE
import samlang.ast.mir.MidIrStatement.MoveTemp

internal object TileGenericMoveTemp : IrStatementTile<MoveTemp> {
    override fun getTilingResult(node: MoveTemp, dpTiling: DpTiling): StatementTilingResult {
        val irSource = node.source
        val resultReg = REG(node.tempId)
        val srcTilingResult = dpTiling.tileArg(irSource)
        val instructions = arrayListOf<AssemblyInstruction>()
        instructions += COMMENT(comment = "GenericMoveTemp: $node")
        instructions += srcTilingResult.instructions
        instructions += MOVE(resultReg, srcTilingResult.arg)
        return StatementTilingResult(instructions)
    }
}
