package samlang.ast.common

data class TypeDefinition(
    override val range: Range,
    val type: TypeDefinitionType,
    val typeParameters: List<String>,
    val mappings: Map<String, Type>
) : Node {
    companion object {
        /**
         * @return a dummy type definition used for util class.
         */
        fun ofDummy(range: Range): TypeDefinition = TypeDefinition(
            range = range,
            type = TypeDefinitionType.OBJECT,
            typeParameters = emptyList(),
            mappings = emptyMap()
        )
    }
}
