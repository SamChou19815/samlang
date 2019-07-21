package samlang.checker

import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.ImmutableSet
import kotlinx.collections.immutable.immutableListOf
import kotlinx.collections.immutable.immutableSetOf
import samlang.ast.Module
import samlang.ast.ModuleMembersImport
import samlang.ast.ModuleReference
import samlang.ast.Range
import samlang.errors.CompileTimeError
import samlang.errors.CyclicDependencyError

internal class CyclicDependencyChecker {

    /**
     * A (key, value) pair in this graph means (module A, modules that directly depend on module A).
     */
    private val dependencyGraph: MutableMap<ModuleReference, MutableList<ModuleMembersImport>> =
        LinkedHashMap()
    private val hasDependentsSet: MutableSet<ModuleReference> = hashSetOf()
    private val errorCollector: ErrorCollector = ErrorCollector()

    fun addImports(moduleReference: ModuleReference, module: Module) {
        val dependencyList = dependencyGraph.computeIfAbsent(moduleReference) { arrayListOf() }
        for (oneImport in module.imports) {
            dependencyList.add(element = oneImport)
            hasDependentsSet.add(element = oneImport.moduleReference)
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
        parentChain: OrderedPersistentSet<ModuleReference>,
        allVisited: MutableSet<ModuleReference>
    ) {
        val importedModuleReference = imported.moduleReference
        if (importedModuleReference in allVisited) {
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
        allVisited.add(element = importedModuleReference)
        val newParentChain = parentChain + importedModuleReference
        val dependencies = dependencyGraph[importedModuleReference] ?: return
        for (importedDependency in dependencies) {
            errorCollector.check {
                tryToBuildDAG(
                    importer = importedModuleReference,
                    imported = importedDependency,
                    parentChain = newParentChain,
                    allVisited = allVisited
                )
            }
        }
        return
    }

    private fun tryToBuildDAG(startingModule: ModuleReference, allVisited: MutableSet<ModuleReference>) {
        tryToBuildDAG(
            importer = ModuleReference.ROOT,
            imported = ModuleMembersImport(
                range = Range.DUMMY,
                moduleReference = startingModule,
                importedMembers = emptyList()
            ),
            parentChain = OrderedPersistentSet(),
            allVisited = allVisited
        )
    }

    fun getCyclicDependencyErrors(): List<CompileTimeError> {
        if (dependencyGraph.isEmpty()) {
            return emptyList()
        }
        val allVisited = hashSetOf<ModuleReference>()
        // Start with modules with zero dependents.
        for (moduleReference in dependencyGraph.keys) {
            if (moduleReference !in hasDependentsSet) {
                tryToBuildDAG(startingModule = moduleReference, allVisited = allVisited)
            }
        }
        for (moduleReference in dependencyGraph.keys) {
            if (moduleReference !in allVisited) {
                tryToBuildDAG(startingModule = moduleReference, allVisited = allVisited)
            }
        }
        return errorCollector.collectedErrors
    }
}
