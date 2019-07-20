package samlang.checker

import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.ImmutableSet
import kotlinx.collections.immutable.immutableListOf
import kotlinx.collections.immutable.immutableSetOf
import samlang.ast.Module
import samlang.ast.Range
import samlang.errors.CompileTimeError
import samlang.errors.CyclicDependencyError

internal class CyclicDependencyChecker {

    /**
     * A (key, value) pair in this graph means (module A, modules that directly depend on module A).
     */
    private val dependencyGraph: MutableMap<String, MutableList<Pair<String, Range>>> = hashMapOf()
    private val hasDependentsSet: MutableSet<String> = hashSetOf()
    private val errorCollector: ErrorCollector = ErrorCollector()

    fun addImports(moduleName: String, module: Module) {
        val dependencyList = dependencyGraph.computeIfAbsent(moduleName) { arrayListOf() }
        for (oneImport in module.imports) {
            dependencyList.add(element = oneImport)
            hasDependentsSet.add(oneImport.first)
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
        moduleName: String,
        sourceNameRange: Range = Range.DUMMY,
        parentChain: OrderedPersistentSet<String> = OrderedPersistentSet(),
        allVisited: MutableSet<String>
    ) {
        if (moduleName in allVisited) {
            if (moduleName !in parentChain) {
                // Reached end
                return
            }
            val fullChain = parentChain.immutableList.add(element = moduleName)
            val cyclicDependencyChain = fullChain.subList(
                fromIndex = fullChain.indexOfFirst { it == moduleName },
                toIndex = fullChain.size
            )
            throw CyclicDependencyError(
                moduleName = moduleName,
                range = sourceNameRange,
                cyclicDependencyChain = cyclicDependencyChain
            )
        }
        allVisited.add(element = moduleName)
        val newParentChain = parentChain + moduleName
        val dependencies = dependencyGraph[moduleName] ?: return
        for ((dependencyName, dependencyRange) in dependencies) {
            errorCollector.check {
                tryToBuildDAG(
                    moduleName = dependencyName,
                    sourceNameRange = dependencyRange,
                    parentChain = newParentChain,
                    allVisited = allVisited
                )
            }
        }
        return
    }

    fun getCyclicDependencyErrors(): List<CompileTimeError> {
        if (dependencyGraph.isEmpty()) {
            return emptyList()
        }
        val allVisited = hashSetOf<String>()
        // Start with modules with zero dependents.
        for (module in dependencyGraph.keys) {
            if (module !in hasDependentsSet) {
                tryToBuildDAG(moduleName = module, allVisited = allVisited)
            }
        }
        for (module in dependencyGraph.keys) {
            if (module !in allVisited) {
                tryToBuildDAG(moduleName = module, allVisited = allVisited)
            }
        }
        return errorCollector.collectedErrors
    }
}
