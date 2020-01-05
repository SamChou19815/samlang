package samlang.checker

internal interface IdentifierTypeValidator {
    /**
     * Given the [name] of the identifier and the number of applied arguments, check the context to see whether it
     * matches any type definition in scope.
     */
    fun identifierTypeIsWellDefined(name: String, typeArgumentLength: Int): Boolean
}
