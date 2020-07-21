package samlang.compiler.mir

import samlang.ast.mir.MidIrExpression.Companion.TEMP
import samlang.ast.mir.MidIrExpression.Temporary

/** An allocator for one time or many time use resources, including temp and label. */
internal class MidIrResourceAllocator(
    private val functionName: String,
    val globalResourceAllocator: MidIrGlobalResourceAllocator
) {
    private var nextLabelId: Int = 0
    private var nextTempId: Int = 0
    private val tempMap: MutableMap<String, Temporary> = mutableMapOf()

    /**
     * Allocate a label for IR usage.
     *
     * @return a label string. This string should be only used and not inspected.
     */
    fun allocateLabel(): String {
        val temp = nextLabelId
        nextLabelId++
        return "LABEL_" + functionName + "_" + temp
    }

    /**
     * Allocate a label for IR usage.
     *
     * @param annotation additional information for debugging
     * @return a label string. This string should be only used and not inspected.
     */
    fun allocateLabelWithAnnotation(annotation: String): String {
        val temp = nextLabelId
        nextLabelId++
        return "LABEL_" + functionName + temp + "_PURPOSE_" + annotation
    }

    /**
     * Allocate and return a temporary for a given variable.
     *
     * @param variableName a variable name without function name prefix.
     * @return a temp object expression.
     */
    fun allocateTemp(variableName: String): Temporary {
        val temp = TEMP(id = "_$variableName")
        // use : to concat because it will never be a valid part of identifier!
        tempMap["$functionName:$variableName"] = temp
        return temp
    }

    /**
     * @param variableName the variable name.
     * @return the temporary that is mapped to a given variable.
     * @throws IllegalArgumentException if the variable is not found in this resource manager.
     */
    fun getTemporaryByVariable(variableName: String?): Temporary {
        val name = "$functionName:$variableName"
        return tempMap[name] ?: error(message = "Variable name [$variableName] not found. Available: ${tempMap.keys}")
    }
}
