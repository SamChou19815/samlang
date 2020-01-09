package samlang.ast.java

import samlang.ast.common.ModuleMembersImport
import samlang.ast.hir.HighIrClassDefinition

data class JavaOuterClass(
    val imports: List<ModuleMembersImport>,
    val innerStaticClasses: List<HighIrClassDefinition>
)
