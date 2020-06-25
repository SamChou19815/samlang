package samlang.ast.lang

import samlang.ast.common.Range
import samlang.ast.common.Type

data class ClassDeclaration(
    override val range: Range,
    override val nameRange: Range,
    override val name: String,
    override val isPublic: Boolean,
    override val members: List<MemberDeclaration>
) : ClassInterface<ClassDeclaration.MemberDeclaration> {

    data class MemberDeclaration(
        override val range: Range,
        override val isPublic: Boolean,
        override val isMethod: Boolean,
        override val nameRange: Range,
        override val name: String,
        override val typeParameters: List<String>,
        override val type: Type.FunctionType,
        override val parameters: List<AnnotatedParameter>,
        val body: Expression
    ) : ClassMemberInterface
}
