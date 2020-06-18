package samlang.ast.lang

import samlang.ast.common.Node
import samlang.ast.common.Range
import samlang.ast.common.TypeDefinition

interface ClassInterface<M : ClassMemberInterface> : Node {
    val nameRange: Range
    val name: String
    val isPublic: Boolean
    val typeDefinition: TypeDefinition
    val members: List<M>
}
