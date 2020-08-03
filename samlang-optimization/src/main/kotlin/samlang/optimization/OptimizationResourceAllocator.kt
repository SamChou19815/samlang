package samlang.optimization

import samlang.ast.mir.MidIrExpression
import samlang.ast.mir.MidIrExpression.Companion.TEMP

/**
 * The resource allocator for optimization stage.
 * It can generate globally unique identifiers for temp and label.
 */
internal object OptimizationResourceAllocator {
    private var tempId: Int = 0
    private var labelId: Int = 0

    fun nextTemp(): MidIrExpression.Temporary = TEMP(id = "_TEMP_OPT_" + tempId++)

    fun nextLabel(): String = "LABEL_OPT_" + labelId++
}
