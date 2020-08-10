package samlang.compiler.asm.tiling

import samlang.ast.asm.*
import samlang.ast.asm.AssemblyInstruction.*

/** The common tiling result interface. */
interface TilingResult {
    /** @return a list of assembly instructions. */
    val instructions: List<AssemblyInstruction>

    /** @return cost of this tiling. */
    val cost: Int
        get() {
            var cost = 0
            for (instruction in instructions) {
                if (instruction is Label || instruction is Comment) {
                    continue
                }
                if (instruction is Neg) {
                    // unary ops are cheap
                    continue
                }
                if (instruction is IMulTwoArgs ||
                    instruction is IMulThreeArgs ||
                    instruction is IDiv
                ) {
                    cost += 4
                } else if (instruction is LoadEffectiveAddress) {
                    cost += 2
                } else {
                    cost++
                }
            }
            return cost
        }
}

/** The tiling result for a general assembly arg. */
interface AssemblyArgTilingResult : TilingResult {
    /** @return a general arg as the tiling result. */
    val arg: AssemblyArg
}

/** The tiling result for const and reg. */
interface ConstOrRegTilingResult : AssemblyArgTilingResult {
    /** @return a register or constant as the final result. */
    val constOrReg: ConstOrReg
}

/** The tiling result for reg and mem.  */
interface RegOrMemTilingResult : AssemblyArgTilingResult {
    /** @return a register or mem as the final result. */
    val regOrMem: RegOrMem
}

/** The result of tiling an expression, specialized for mem. */
internal data class MemTilingResult(
    override val instructions: List<AssemblyInstruction>,
    val mem: AssemblyArgs.Mem
) : RegOrMemTilingResult {
    override val regOrMem: RegOrMem get() = mem
    override val arg: AssemblyArg get() = mem
}

/** The result of tiling an expression, specialized for const. */
data class ConstTilingResult(private val constNode: AssemblyArgs.Const) : ConstOrRegTilingResult {
    override val instructions: List<AssemblyInstruction> = emptyList()
    override val constOrReg: ConstOrReg get() = constNode
    override val arg: AssemblyArg get() = constNode
}

/** The result of tiling an expression. */
data class ExpressionTilingResult(
    override val instructions: List<AssemblyInstruction>,
    val reg: AssemblyArgs.Reg
) : ConstOrRegTilingResult, RegOrMemTilingResult {
    override val constOrReg: ConstOrReg get() = reg
    override val regOrMem: RegOrMem get() = reg
    override val arg: AssemblyArg get() = reg
}

/** The result of tiling a statement. */
data class StatementTilingResult(override val instructions: List<AssemblyInstruction>) : TilingResult
