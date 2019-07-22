package samlang.ast

data class ModuleMembersImport(
    override val range: Range,
    val importedMembers: List<Pair<String, Range>>,
    val importedModule: ModuleReference,
    val importedModuleRange: Range
) : Node
