package samlang.ast

data class ModuleReference(val parts: List<String>) {

    constructor(moduleName: String) : this(parts = listOf(moduleName))

    fun toFilename(): String = parts.joinToString(separator = "/", postfix = ".sam")
    override fun toString(): String = parts.joinToString(separator = ".")

    companion object {
        /**
         * The root module that can never be referenced in the source code.
         * It can be used as a starting point for cyclic dependency analysis,
         * since it cannot be named according to the syntax so no module can depend on it.
         */
        val ROOT: ModuleReference = ModuleReference(parts = emptyList())
    }
}
