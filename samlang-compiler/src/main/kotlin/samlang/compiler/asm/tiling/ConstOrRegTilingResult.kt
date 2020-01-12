package samlang.compiler.asm.tiling

import samlang.ast.asm.ConstOrReg

/** The tiling result for const and reg. */
interface ConstOrRegTilingResult : AssemblyArgTilingResult {
    /** @return a register or constant as the final result. */
    val constOrReg: ConstOrReg
}
