package samlang.ast

data class Module(
    override val range: Range,
    val nameRange: Range,
    val name: String,
    val typeDefinition: TypeDefinition,
    val members: List<MemberDefinition>
) : Node {

    enum class TypeDefinitionType(val displayName: String) {
        OBJECT(displayName = "object"), VARIANT(displayName = "variant");
    }

    data class TypeDefinition(
        override val range: Range,
        val type: TypeDefinitionType,
        val typeParameters: List<String>?,
        val mappings: Map<String, Type>
    ) : Node

    data class MemberDefinition(
        override val range: Range,
        val isPublic: Boolean,
        val isMethod: Boolean,
        val nameRange: Range,
        val name: String,
        val typeParameters: List<String>?,
        val type: Type.FunctionType,
        val parameters: List<Parameter>,
        val body: Expression
    ) : Node {

        data class Parameter(val name: String, val nameRange: Range, val type: Type, val typeRange: Range)
    }
}
