package samlang.util

/**
 * An lazily allocated union find data structure.
 */
class UnionFind {

    private val parent: MutableMap<Int, Int> = hashMapOf()
    private val treeSize: MutableMap<Int, Int> = hashMapOf()

    override fun toString(): String = "[parent: $parent, treeSize: $treeSize]"

    private fun getParent(index: Int): Int {
        val currentParent = parent[index]
        if (currentParent == null) {
            parent[index] = index
            treeSize[index] = 1
            return index
        }
        return currentParent
    }

    private fun getTreeSize(index: Int): Int {
        val currentTreeSize = treeSize[index]
        if (currentTreeSize == null) {
            parent[index] = index
            treeSize[index] = 1
            return 1
        }
        return currentTreeSize
    }

    /**
     * Find the root of [index].
     */
    fun find(index: Int): Int {
        val currentParent = getParent(index)
        return if (currentParent == index) {
            currentParent
        } else {
            val parentOfParent = find(index = currentParent)
            parent[index] = parentOfParent
            parentOfParent
        }
    }

    /**
     * Link [i] and [j] and returns their new common root.
     */
    fun link(i: Int, j: Int): Int {
        var iRoot = find(index = i)
        var jRoot = find(index = j)
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
