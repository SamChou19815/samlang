package samlang.compiler.mir

import samlang.ast.common.GlobalVariable

internal class MidIrGlobalResourceAllocator {
    private var nextGlobalVariableId: Int = 0
    private var nextLambdaFunctionId: Int = 0
    private val globalVariableReferenceMap: MutableMap<String, GlobalVariable> = LinkedHashMap()

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
        globalVariableReferenceMap[reference] = variable
        nextGlobalVariableId++
        return variable
    }

    fun allocateLambdaFunctionName(): String {
        val id = nextLambdaFunctionId
        nextLambdaFunctionId++
        return "function_lambda_$id"
    }
}
