package samlang.compiler.mir

import samlang.ast.common.GlobalVariable

internal class MidIrGlobalResourceAllocator {
    private var nextGlobalVariableId: Int = 0
    private val globalVariableReferenceMap: MutableMap<String, GlobalVariable> = LinkedHashMap()

    fun allocateStringArrayGlobalVariable(string: String): GlobalVariable {
        val existing = globalVariableReferenceMap["STRING_CONTENT_$string"]
        if (existing != null) {
            return existing
        }
        val variable = GlobalVariable(name = "GLOBAL_STRING_$nextGlobalVariableId", content = string)
        nextGlobalVariableId++
        globalVariableReferenceMap["STRING_CONTENT_$string"] = variable
        return variable
    }
}
