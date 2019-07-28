package samlang.ast.ts

import samlang.ast.common.ModuleMembersImport
import samlang.ast.common.TypeDefinition

data class TsModule(
    val imports: List<ModuleMembersImport>,
    val typeDefinitions: List<Pair<String, TypeDefinition>>,
    val functions: List<TsFunction>
)
