package samlang.compiler.asm.tiling

import samlang.ast.mir.MidIrStatement

/** A tile for IR statements. */
internal interface IrStatementTile<T : MidIrStatement> : IrTile<T, StatementTilingResult>
