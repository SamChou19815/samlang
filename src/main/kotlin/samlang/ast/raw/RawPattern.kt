package samlang.ast.raw

import samlang.ast.common.Position

sealed class RawPattern {

    abstract val position: Position

    data class TuplePattern(
        override val position: Position,
        val destructedNames: List<Position.WithName?>
    ) : RawPattern()

    data class ObjectPattern(
        override val position: Position,
        val destructedNames: List<Pair<Position.WithName, Position.WithName?>>
    ) : RawPattern()

    data class VariablePattern(
        override val position: Position,
        val name: String
    ) : RawPattern()

    data class WildCardPattern(override val position: Position) : RawPattern()

}
