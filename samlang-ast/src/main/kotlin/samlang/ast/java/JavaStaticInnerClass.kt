package samlang.ast.java

import samlang.ast.common.TypeDefinition

data class JavaStaticInnerClass(
    val className: String,
    val typeDefinition: TypeDefinition,
    val methods: List<JavaMethod>
)
