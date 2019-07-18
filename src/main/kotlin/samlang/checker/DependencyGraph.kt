package samlang.checker

import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.ImmutableSet
import kotlinx.collections.immutable.immutableListOf
import kotlinx.collections.immutable.immutableSetOf
import samlang.ast.Range
import samlang.ast.Source
import samlang.errors.CyclicDependencyError

internal class DependencyGraph {

    /**
     * A (key, value) pair in this graph means (source A, sources that directly depend on module A).
     */
    private val graph: MutableMap<String, MutableList<Pair<String, Range>>> = hashMapOf()

    fun addImports(sourceName: String, source: Source) {
        val dependencyList = graph.computeIfAbsent(sourceName) { arrayListOf() }
        for (oneImport in source.imports) {
            dependencyList.add(element = oneImport)
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

    private fun buildDAG(
        sourceName: String,
        sourceNameRange: Range = Range.DUMMY,
        parentChain: OrderedPersistentSet<String> = OrderedPersistentSet(),
        allVisited: MutableSet<String> = hashSetOf()
    ) {
        if (sourceName in allVisited) {
            if (sourceName !in parentChain) {
                // Reached end
                return
            } else {
                val fullChain = parentChain.immutableList.add(element = sourceName)
                val cyclicDependencyChain = fullChain.subList(
                    fromIndex = fullChain.indexOfFirst { it == sourceName },
                    toIndex = fullChain.size
                )
                throw CyclicDependencyError(
                    sourceName = sourceName,
                    range = sourceNameRange,
                    cyclicDependencyChain = cyclicDependencyChain
                )
            }
        }
        val dependencies: List<Pair<String, Range>> = graph[sourceName] ?: emptyList()
        for ((dependencyName, dependencyRange) in dependencies) {
            allVisited.add(element = sourceName)
            buildDAG(
                sourceName = dependencyName,
                sourceNameRange = dependencyRange,
                parentChain = parentChain + sourceName,
                allVisited = allVisited
            )
        }
    }

    fun getCyclicDependencyErrors() {
        if (graph.isEmpty()) {
            return
        }
        var builtAtLeastOneDAG = false
        for ((source, directDependencies) in graph) {
            if (directDependencies.isEmpty()) {
                buildDAG(sourceName = source)
                builtAtLeastOneDAG = true
            }
        }
        if (!builtAtLeastOneDAG) {
            // Force building a DAG to error
            buildDAG(sourceName = graph.keys.first())
        }
    }
}
