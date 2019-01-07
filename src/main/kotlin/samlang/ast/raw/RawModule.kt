package samlang.ast.raw

import samlang.parser.Position

data class RawModule(
    override val position: Position,
    val name: Position.WithName,
    val typeDef: RawTypeDef?,
    val members: List<RawMemberDefinition>
) : RawNode {

    sealed class RawTypeDef : RawNode {

        abstract val typeParams: List<Position.WithName>?

        data class ObjectType(
            override val position: Position,
            override val typeParams: List<Position.WithName>?,
            val mappings: List<Pair<String, Pair<Position, RawTypeExpr>>>
        ) : RawTypeDef()

        data class VariantType(
            override val position: Position,
            override val typeParams: List<Position.WithName>?,
            val mappings: List<Pair<String, Pair<Position, RawTypeExpr>>>
        ) : RawTypeDef()

    }

    data class RawMemberDefinition(
        override val position: Position,
        val isPublic: Boolean,
        val isMethod: Boolean,
        val typeParameters: List<Position.WithName>?,
        val name: Position.WithName,
        val typeAnnotation: RawTypeExpr.FunctionType,
        val value: RawExpr.Lambda
    ) : RawNode

}
