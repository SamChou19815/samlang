package samlang.ast.common

data class TypeDefinition(
    override val range: Range,
    val type: TypeDefinitionType,
    val typeParameters: List<String>?,
    val mappings: Map<String, Type>
) : Node
