package samlang.ast

data class ModuleReference(override val range: Range, val parts: List<String>) : Node {
    fun toFilename(): String = parts.joinToString(separator = "/", postfix = ".sam")
    override fun toString(): String = parts.joinToString(separator = ".")

    companion object {
        /**
         * The root module that can never be referenced in the source code.
         * It can be used as a starting point for cyclic dependency analysis,
         * since it cannot be named according to the syntax so no module can depend on it.
         */
        val ROOT: ModuleReference = ModuleReference(range = Range.DUMMY, parts = emptyList())
    }
}
