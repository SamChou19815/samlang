package samlang.compiler.mir

import samlang.ast.common.GlobalVariable
import samlang.ast.mir.MidIrExpression.Companion.TEMP
import samlang.ast.mir.MidIrExpression.Temporary

/** An allocator for one time or many time use resources, including temp and label. */
internal class MidIrResourceAllocator(private val functionName: String) {
    private var nextLabelId: Int = 0
    private var nextTempId: Int = 0
    private var nextGlobalVariableId: Int = 0
    private val tempMap: MutableMap<String, Temporary> = hashMapOf()
    private val globalVariableReferenceMap: MutableMap<String, GlobalVariable> = LinkedHashMap()

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
     * Allocate and return an anonymous temporary for IR usage.
     *
     * @return a temp object expression. You should not inspect the values of the temporary.
     */
    fun allocateTemp(): Temporary {
        val temp = TEMP(id = "_t$nextTempId")
        nextTempId++
        return temp
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
        return tempMap[name] ?: error(message = "Variable name [$variableName] not found.")
    }

    fun allocateStringGlobalVariable(string: String): Pair<GlobalVariable, GlobalVariable> =
        allocateLongGlobalVariable(reference = "STRING_REFERENCE_$string") to
                allocateStringArrayGlobalVariable(string = string)

    private fun allocateStringArrayGlobalVariable(string: String): GlobalVariable {
        val existing = globalVariableReferenceMap["STRING_CONTENT_$string"]
        if (existing != null) {
            return existing
        }
        val variable = GlobalVariable(name = "GLOBAL_$nextGlobalVariableId", size = 8 * string.length + 8)
        nextGlobalVariableId++
        globalVariableReferenceMap["STRING_$string"] = variable
        return variable
    }

    private fun allocateLongGlobalVariable(reference: String): GlobalVariable {
        val existing = globalVariableReferenceMap[reference]
        if (existing != null) {
            return existing
        }
        val variable = GlobalVariable(name = "GLOBAL_$nextGlobalVariableId", size = 8)
        nextGlobalVariableId++
        return variable
    }
}
