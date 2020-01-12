package samlang.compiler.asm.tiling

import samlang.ast.asm.AssemblyArg
import samlang.ast.asm.AssemblyArgs
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.ConstOrReg

/** The result of tiling an expression, specialized for const. */
data class ConstTilingResult(private val constNode: AssemblyArgs.Const) : ConstOrRegTilingResult {
    override val instructions: List<AssemblyInstruction> = emptyList()
    override val constOrReg: ConstOrReg get() = constNode
    override val arg: AssemblyArg get() = constNode
}
