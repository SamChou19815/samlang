package samlang.ast.lang

import samlang.ast.common.Node
import samlang.ast.common.Range

data class ModuleMembersImport(
    override val range: Range,
    val importedMembers: List<Pair<String, Range>>,
    val importedModule: ModuleReference,
    val importedModuleRange: Range
) : Node
