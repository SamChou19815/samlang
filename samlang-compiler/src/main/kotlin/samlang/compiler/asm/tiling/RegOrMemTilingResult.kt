package samlang.compiler.asm.tiling

import samlang.ast.asm.RegOrMem

/** The tiling result for reg and mem.  */
interface RegOrMemTilingResult : AssemblyArgTilingResult {
    /** @return a register or mem as the final result. */
    val regOrMem: RegOrMem
}
