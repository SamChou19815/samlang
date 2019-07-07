package samlang.ast

data class Module(
    override val range: Range,
    val nameRange: Range,
    val name: String,
    val typeDefinition: TypeDefinition?,
    val members: List<MemberDefinition>
) : Node {

    sealed class TypeDefinition : Node {

        abstract val typeParameters: List<String>?

        data class ObjectType(
            override val range: Range,
            override val typeParameters: List<String>?,
            val mappings: Map<String, Type>
        ) : TypeDefinition()

        data class VariantType(
            override val range: Range,
            override val typeParameters: List<String>?,
            val mappings: Map<String, Type>
        ) : TypeDefinition()

    }

    data class MemberDefinition(
        override val range: Range,
        val isPublic: Boolean,
        val isMethod: Boolean,
        val name: String,
        val type: Pair<List<String>?, Type.FunctionType>,
        val value: Expression.Lambda
    ) : Node

}
