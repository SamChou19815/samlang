package samlang.ast.lang

import samlang.ast.common.Node
import samlang.ast.common.Range
import samlang.ast.common.Type

interface ClassMemberInterface : Node {
    val isPublic: Boolean
    val isMethod: Boolean
    val nameRange: Range
    val name: String
    val typeParameters: List<String>
    val type: Type.FunctionType
    val parameters: List<AnnotatedParameter>
}
