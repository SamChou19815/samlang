package samlang.checker

import samlang.ast.common.ModuleReference

/**
 * A centralized place to manage up-to-date dependency relationship.
 * It is particularly useful for incremental type checking.
 */
class DependencyTracker {
    private val forwardDependency: MutableMap<ModuleReference, Set<ModuleReference>> = hashMapOf()
    private val reverseDependency: MutableMap<ModuleReference, MutableSet<ModuleReference>> = hashMapOf()

    fun getForwardDependencies(moduleReference: ModuleReference): Set<ModuleReference> =
        forwardDependency[moduleReference] ?: emptySet()

    fun getReverseDependencies(moduleReference: ModuleReference): Set<ModuleReference> =
        reverseDependency[moduleReference] ?: emptySet()

    /**
     * Update dependency tracker with [moduleReference] and [importedModules].
     * If [importedModules] is null, it means that we want to remove [moduleReference] from system.
     */
    fun update(moduleReference: ModuleReference, importedModules: Collection<ModuleReference>?) {
        val oldImportedModules = forwardDependency[moduleReference]
        if (oldImportedModules != null) {
            for (oldImportedModule in oldImportedModules) {
                val reverseDependencySet = reverseDependency[oldImportedModule] ?: continue
                reverseDependencySet.remove(moduleReference)
            }
        }
        if (importedModules == null) {
            forwardDependency.remove(key = moduleReference)
            return
        }
        val newImportedModules = importedModules.toSet()
        forwardDependency[moduleReference] = newImportedModules
        for (newImportedModule in newImportedModules) {
            reverseDependency.computeIfAbsent(newImportedModule) { hashSetOf() }.add(element = moduleReference)
        }
    }
}
