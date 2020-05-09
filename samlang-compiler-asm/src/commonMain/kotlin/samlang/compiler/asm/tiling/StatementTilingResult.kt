package samlang.compiler.asm.tiling

import samlang.ast.asm.AssemblyInstruction

/** The result of tiling a statement. */
data class StatementTilingResult(override val instructions: List<AssemblyInstruction>) : TilingResult
