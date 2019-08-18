package samlang.ast.java

import samlang.ast.common.ModuleMembersImport

data class JavaOuterClass(
    val imports: List<ModuleMembersImport>,
    val innerStaticClasses: List<JavaStaticInnerClass>
)
