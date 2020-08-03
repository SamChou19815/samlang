package samlang.compiler.asm.tiling

import samlang.ast.asm.AssemblyArg

/** The tiling result for a general assembly arg. */
interface AssemblyArgTilingResult : TilingResult {
    /** @return a general arg as the tiling result. */
    val arg: AssemblyArg
}
