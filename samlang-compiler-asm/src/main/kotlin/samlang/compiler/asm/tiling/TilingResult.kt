package samlang.compiler.asm.tiling

import samlang.ast.asm.AssemblyInstruction
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
