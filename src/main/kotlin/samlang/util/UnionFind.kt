package samlang.util

class UnionFind {

    private val parent: MutableList<Int> = arrayListOf()
    private val treeSize: MutableList<Int> = arrayListOf()

    override fun toString(): String = "[parent: $parent, treeSize: $treeSize]"

    /**
     * Returns the current capacity of the union find.
     */
    val capacity: Int get() = parent.size

    /**
     * Extend the capacity of the union find by [additionalSize], which defaults to one.
     */
    fun extend(additionalSize: Int = 1) {
        val currentSize = parent.size
        for (i in 0 until additionalSize) {
            parent.add(element = currentSize + i)
            treeSize.add(element = 1)
        }
    }

    /**
     * Find the root of [i].
     */
    fun find(i: Int): Int {
        if (parent[i] != i) {
            parent[i] = find(i = parent[i])
        }
        return parent[i]
    }

    /**
     * Return a set of all roots.
     */
    fun roots(): Set<Int> {
        val set = hashSetOf<Int>()
        for (i in parent.indices) {
            set.add(element = find(i = i))
        }
        return set
    }

    /**
     * Link [i] and [j] and returns their new common root.
     */
    fun link(i: Int, j: Int): Int {
        if (treeSize[i] < treeSize[j]) {
            return link(i = j, j = i)
        }
        var iRoot = find(i = i)
        var jRoot = find(i = j)
        if (iRoot == jRoot) {
            return iRoot
        }
        if (treeSize[iRoot] < treeSize[jRoot]) {
            val temp = iRoot
            iRoot = jRoot
            jRoot = temp
        }
        parent[jRoot] = iRoot
        treeSize[iRoot] += treeSize[jRoot]
        return iRoot
    }

}
