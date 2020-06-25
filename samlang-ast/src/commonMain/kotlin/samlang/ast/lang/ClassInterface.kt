package samlang.ast.lang

import samlang.ast.common.Node
import samlang.ast.common.Range

interface ClassInterface<M : ClassMemberInterface> : Node {
    val nameRange: Range
    val name: String
    val isPublic: Boolean
    val members: List<M>
}
