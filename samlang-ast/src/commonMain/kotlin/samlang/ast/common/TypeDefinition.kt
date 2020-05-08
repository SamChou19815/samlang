package samlang.ast.common

data class TypeDefinition(
    override val range: Range,
    val type: TypeDefinitionType,
    val typeParameters: List<String>,
    val names: List<String>,
    val mappings: Map<String, FieldType>
) : Node {
    data class FieldType(val type: Type, val isPublic: Boolean)

    companion object {
        /** @return a dummy type definition used for util class. */
        fun ofDummy(range: Range = Range.DUMMY): TypeDefinition = TypeDefinition(
            range = range,
            type = TypeDefinitionType.OBJECT,
            typeParameters = emptyList(),
            names = emptyList(),
            mappings = emptyMap()
        )
    }
}
