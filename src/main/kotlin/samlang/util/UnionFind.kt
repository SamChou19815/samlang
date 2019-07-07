package samlang.util

/**
 * An lazily allocated union find data structure.
 */
class UnionFind {

    private val parent: MutableMap<Int, Int> = hashMapOf()
    private val treeSize: MutableMap<Int, Int> = hashMapOf()

    override fun toString(): String = "[parent: $parent, treeSize: $treeSize]"

    private fun getParent(i: Int): Int {
        val currentParent = parent[i]
        if (currentParent == null) {
            parent[i] = i
            treeSize[i] = 1
            return i
        }
        return currentParent
    }

    private fun getTreeSize(i: Int): Int {
        val currentTreeSize = treeSize[i]
        if (currentTreeSize == null) {
            parent[i] = i
            treeSize[i] = 1
            return 1
        }
        return currentTreeSize
    }

    /**
     * Find the root of [i].
     */
    fun find(i: Int): Int {
        val currentParent = getParent(i)
        return if (currentParent == i) {
            currentParent
        } else {
            val parentOfParent = find(i = currentParent)
            parent[i] = parentOfParent
            parentOfParent
        }
    }

    /**
     * Link [i] and [j] and returns their new common root.
     */
    fun link(i: Int, j: Int): Int {
        var iRoot = find(i = i)
        var jRoot = find(i = j)
        if (iRoot == jRoot) {
            return iRoot
        }
        if (getTreeSize(iRoot) < getTreeSize(jRoot)) {
            val temp = iRoot
            iRoot = jRoot
            jRoot = temp
        }
        parent[jRoot] = iRoot
        treeSize[iRoot] = getTreeSize(iRoot) + getTreeSize(jRoot)
        return iRoot
    }

}
