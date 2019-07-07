package samlang.ast.raw

import samlang.ast.common.Range

data class RawModule(
    override val range: Range,
    val name: Range.WithName,
    val typeDef: RawTypeDef?,
    val members: List<RawMemberDefinition>
) : RawNode {

    sealed class RawTypeDef : RawNode {

        abstract val typeParams: List<Range.WithName>?

        data class ObjectType(
            override val range: Range,
            override val typeParams: List<Range.WithName>?,
            val mappings: List<Pair<String, Pair<Range, RawTypeExpr>>>
        ) : RawTypeDef()

        data class VariantType(
            override val range: Range,
            override val typeParams: List<Range.WithName>?,
            val mappings: List<Pair<String, Pair<Range, RawTypeExpr>>>
        ) : RawTypeDef()

    }

    data class RawMemberDefinition(
        override val range: Range,
        val isPublic: Boolean,
        val isMethod: Boolean,
        val typeParameters: List<Range.WithName>?,
        val name: Range.WithName,
        val typeAnnotation: RawTypeExpr.FunctionType,
        val value: RawExpr.Lambda
    ) : RawNode

}
