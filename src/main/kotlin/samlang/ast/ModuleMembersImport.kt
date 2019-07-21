package samlang.ast

data class ModuleMembersImport(
    override val range: Range,
    val moduleReference: ModuleReference,
    val importedMembers: List<Pair<String, Range>>
) : Node
