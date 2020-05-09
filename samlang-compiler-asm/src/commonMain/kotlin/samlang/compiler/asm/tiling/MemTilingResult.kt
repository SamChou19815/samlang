package samlang.compiler.asm.tiling

import samlang.ast.asm.AssemblyArg
import samlang.ast.asm.AssemblyArgs
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.RegOrMem

/** The result of tiling an expression, specialized for mem. */
internal data class MemTilingResult(
    override val instructions: List<AssemblyInstruction>,
    val mem: AssemblyArgs.Mem
) : RegOrMemTilingResult {
    override val regOrMem: RegOrMem get() = mem
    override val arg: AssemblyArg get() = mem
}
