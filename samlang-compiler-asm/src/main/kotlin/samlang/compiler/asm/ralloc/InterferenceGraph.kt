package samlang.compiler.asm.ralloc

import samlang.compiler.asm.ralloc.RegisterAllocationConstants.PRE_COLORED_REGS

/**
 * The interference graph for the non-trivial register allocation.
 *
 * Construct an empty interference graph from a set of all registers.
 * After this construction. It's guaranteed that an access to a legal vertex
 * will always succeed.
 */
internal class InterferenceGraph {
    /** The adjacentSet representation. */
    private val adjacentSet: MutableMap<String, MutableSet<String>> = mutableMapOf()
    /** The adjacentList representation. */
    private val adjacentList: MutableMap<String, MutableSet<String>> = mutableMapOf()
    /** All the degrees information for the graph. */
    private val degrees: MutableMap<String, Int> = mutableMapOf()

    /**
     * @param u the u variable node. It must be a valid vertex in the graph.
     * @param v the v variable node. It must be a valid vertex in the graph.
     * @return whether the graph contains edge (u, v).
     */
    fun contains(u: String, v: String): Boolean {
        val uSet = adjacentSet[u] ?: return false
        return uSet.contains(v)
    }

    /**
     * @param variable the variable of interest.
     * @return the adjacent set of the variable, excluding the pre-colored nodes.
     */
    fun getAdjacentList(variable: String): Set<String> = adjacentList[variable] ?: emptySet()

    /**
     * @param variable variable to measure degree.
     * @return the degree of the variable.
     */
    fun degree(variable: String): Int = degrees[variable] ?: 0

    /**
     * Add an edge between two variable nodes.
     *
     * @param u the u variable.
     * @param v the v variable.
     */
    fun addEdge(u: String, v: String) {
        if (u == v) {
            return
        }
        val existingSetOfU = adjacentSet.getOrPut(u) { mutableSetOf() }
        if (existingSetOfU.contains(v)) { // already there. Do nothing
            return
        }
        // add to adjacent set
        existingSetOfU.add(v)
        adjacentSet.getOrPut(v) { mutableSetOf() }.add(u)
        if (!PRE_COLORED_REGS.contains(u)) {
            adjacentList.getOrPut(u) { mutableSetOf() }.add(v)
            degrees[u] = (degrees[u] ?: 0) + 1
        }
        if (!PRE_COLORED_REGS.contains(v)) {
            adjacentList.getOrPut(v) { mutableSetOf() }.add(u)
            degrees[v] = (degrees[v] ?: 0) + 1
        }
    }

    /**
     * Decrease the degree of variable by 1.
     * It leaves the graph structure intact.
     *
     * @param variable the variable to decrement degree.
     * @return the old degree.
     */
    fun decrementDegree(variable: String): Int {
        val oldDegree = degrees[variable] ?: return 0
        degrees[variable] = oldDegree - 1
        return oldDegree
    }

    /**
     * Clear the graph.
     */
    fun clear() {
        adjacentSet.clear()
        adjacentList.clear()
        degrees.clear()
    }
}
