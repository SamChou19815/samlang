package samlang.checker

import kotlinx.collections.immutable.PersistentList
import kotlinx.collections.immutable.PersistentSet
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.persistentSetOf
import samlang.ast.common.ModuleMembersImport
import samlang.ast.common.ModuleReference
import samlang.ast.common.Range
import samlang.ast.common.Sources
import samlang.ast.lang.Module
import samlang.errors.CyclicDependencyError

internal fun getTypeCheckingOrder(sources: Sources<Module>, errorCollector: ErrorCollector): List<ModuleReference> =
    CyclicDependencyChecker(sources = sources, errorCollector = errorCollector).getTypeCheckingOrder()

private class CyclicDependencyChecker(sources: Sources<Module>, private val errorCollector: ErrorCollector) {

    /**
     * A (key, value) pair in this graph means (module A, modules that directly depend on module A).
     */
    private val dependencyGraph: MutableMap<ModuleReference, MutableList<ModuleMembersImport>> =
        LinkedHashMap()
    private val hasDependentsSet: MutableSet<ModuleReference> = hashSetOf()
    private val visitedSet: MutableSet<ModuleReference> = hashSetOf()
    private val visitingList: MutableList<ModuleReference> = arrayListOf()

    init {
        sources.moduleMappings.forEach { (moduleReference, module) ->
            val existingDependencyList = dependencyGraph[moduleReference]
            val dependencyList = if (existingDependencyList == null) {
                val list = mutableListOf<ModuleMembersImport>()
                dependencyGraph[moduleReference] = list
                list
            } else {
                existingDependencyList
            }
            for (oneImport in module.imports) {
                dependencyList.add(element = oneImport)
                hasDependentsSet.add(element = oneImport.importedModule)
            }
        }
    }

    private data class OrderedPersistentSet<T>(
        private val immutableSet: PersistentSet<T> = persistentSetOf(),
        val immutableList: PersistentList<T> = persistentListOf()
    ) {

        operator fun contains(element: T): Boolean = element in immutableSet

        infix operator fun plus(element: T): OrderedPersistentSet<T> =
            OrderedPersistentSet(
                immutableSet = immutableSet.add(element = element),
                immutableList = immutableList.add(element = element)
            )
    }

    private fun tryToBuildDAG(
        importer: ModuleReference = ModuleReference.ROOT,
        imported: ModuleMembersImport,
        parentChain: OrderedPersistentSet<ModuleReference>
    ) {
        val importedModuleReference = imported.importedModule
        if (importedModuleReference in visitedSet) {
            if (importedModuleReference !in parentChain) {
                // Reached end
                return
            }
            val fullChain = parentChain.immutableList.add(element = importedModuleReference)
            val cyclicDependencyChain = fullChain.subList(
                fromIndex = fullChain.indexOfFirst { it == importedModuleReference },
                toIndex = fullChain.size
            ).map { it.toString() }
            errorCollector.add(
                compileTimeError = CyclicDependencyError(
                    moduleReference = importer,
                    range = imported.range,
                    cyclicDependencyChain = cyclicDependencyChain
                )
            )
            return
        }
        visitedSet.add(element = importedModuleReference)
        val newParentChain = parentChain + importedModuleReference
        val dependencies = dependencyGraph[importedModuleReference] ?: return
        for (importedDependency in dependencies) {
            tryToBuildDAG(
                importer = importedModuleReference,
                imported = importedDependency,
                parentChain = newParentChain
            )
        }
        visitingList.add(element = importedModuleReference)
        return
    }

    private fun tryToBuildDAG(startingModule: ModuleReference) {
        tryToBuildDAG(
            importer = ModuleReference.ROOT,
            imported = ModuleMembersImport(
                range = Range.DUMMY,
                importedMembers = emptyList(),
                importedModule = startingModule,
                importedModuleRange = Range.DUMMY
            ),
            parentChain = OrderedPersistentSet()
        )
    }

    fun getTypeCheckingOrder(): List<ModuleReference> {
        if (dependencyGraph.isEmpty()) {
            return emptyList()
        }
        val allVisited = hashSetOf<ModuleReference>()
        // Start with modules with zero dependents.
        for (moduleReference in dependencyGraph.keys) {
            if (moduleReference !in hasDependentsSet) {
                tryToBuildDAG(startingModule = moduleReference)
            }
        }
        for (moduleReference in dependencyGraph.keys) {
            if (moduleReference !in allVisited) {
                tryToBuildDAG(startingModule = moduleReference)
            }
        }
        return visitingList
    }
}
