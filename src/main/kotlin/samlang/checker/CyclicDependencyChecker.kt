package samlang.checker

import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.ImmutableSet
import kotlinx.collections.immutable.immutableListOf
import kotlinx.collections.immutable.immutableSetOf
import samlang.ast.lang.ModuleMembersImport
import samlang.ast.lang.ModuleReference
import samlang.ast.common.Range
import samlang.ast.lang.Sources
import samlang.errors.CyclicDependencyError

internal fun Sources.getTypeCheckingOrder(errorCollector: ErrorCollector): List<ModuleReference> =
    CyclicDependencyChecker(sources = this, errorCollector = errorCollector).getTypeCheckingOrder()

private class CyclicDependencyChecker(sources: Sources, private val errorCollector: ErrorCollector) {

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
            val dependencyList = dependencyGraph.computeIfAbsent(moduleReference) { arrayListOf() }
            for (oneImport in module.imports) {
                dependencyList.add(element = oneImport)
                hasDependentsSet.add(element = oneImport.importedModule)
            }
        }
    }

    private data class OrderedPersistentSet<T>(
        private val immutableSet: ImmutableSet<T> = immutableSetOf(),
        val immutableList: ImmutableList<T> = immutableListOf()
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
            throw CyclicDependencyError(
                moduleReference = importer,
                range = imported.range,
                cyclicDependencyChain = cyclicDependencyChain
            )
        }
        visitedSet.add(element = importedModuleReference)
        val newParentChain = parentChain + importedModuleReference
        val dependencies = dependencyGraph[importedModuleReference] ?: return
        for (importedDependency in dependencies) {
            errorCollector.check {
                tryToBuildDAG(
                    importer = importedModuleReference,
                    imported = importedDependency,
                    parentChain = newParentChain
                )
            }
        }
        visitingList.add(element = importedModuleReference)
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
