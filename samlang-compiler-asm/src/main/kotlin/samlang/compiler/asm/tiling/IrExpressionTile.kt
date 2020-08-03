package samlang.compiler.asm.tiling

import samlang.ast.mir.MidIrExpression

/** A tile for IR expressions. */
internal interface IrExpressionTile<T : MidIrExpression> : IrTile<T, ExpressionTilingResult>
