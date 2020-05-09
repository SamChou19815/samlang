package samlang.compiler.asm.tiling

import samlang.ast.asm.AssemblyArg
import samlang.ast.asm.AssemblyArgs.Reg
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.ConstOrReg
import samlang.ast.asm.RegOrMem

/** The result of tiling an expression. */
data class ExpressionTilingResult(
    override val instructions: List<AssemblyInstruction>,
    val reg: Reg
) : ConstOrRegTilingResult, RegOrMemTilingResult {
    override val constOrReg: ConstOrReg get() = reg
    override val regOrMem: RegOrMem get() = reg
    override val arg: AssemblyArg get() = reg
}
