package samlang.ast.lang

import samlang.ast.common.Node
import samlang.ast.common.Range
import samlang.ast.common.Type
import samlang.ast.common.TypeDefinition

data class ClassDefinition(
    override val range: Range,
    val nameRange: Range,
    val name: String,
    val typeDefinition: TypeDefinition,
    val members: List<MemberDefinition>
) : Node {

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
