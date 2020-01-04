package samlang.checker

import samlang.ast.common.Type
import samlang.ast.common.Type.UndecidedType
import samlang.util.UnionFind

internal class TypeResolution : ReadOnlyTypeResolution {
    /** The union find used to manage the potential complex aliasing relation between different undecided types. */
    private val indexAliasingUnionFind: UnionFind = UnionFind()
    /**
     * A collection of known mappings between the undecided type index and the resolved types.
     * In particular:
     * - the key of the map is almost the root index in the above union find.
     * - the value of the map always represents the best knowledge of the type. i.e. we try to resolve as many undecided
     *   type as possible.
     */
    private val knownResolutions: MutableMap<Int, Type> = mutableMapOf()

    override fun toString(): String =
        "[indexAliasingUnionFind: $indexAliasingUnionFind, knownResolutions: $knownResolutions"

    /** Find the root of an index. */
    private fun Int.findRoot(): Int = indexAliasingUnionFind.find(index = this)

    /**
     * Refresh all the known mappings to ensure it represents the best knowledge we have.
     * Need to be called after each update in the knownResolutions or aliasing relation.
     */
    private fun refreshKnownMappings() {
        val keyCorrectMappings = knownResolutions.mapKeys { (key, _) -> indexAliasingUnionFind.find(index = key) }
        knownResolutions.clear()
        knownResolutions.putAll(from = keyCorrectMappings)
        knownResolutions.replaceAll { _, currentValue -> resolveType(unresolvedType = currentValue) }
    }

    override fun getPartiallyResolvedType(undecidedType: UndecidedType): Type {
        val rootIndex = undecidedType.index.findRoot()
        return knownResolutions[rootIndex] ?: UndecidedType(index = rootIndex)
    }

    override fun resolveType(unresolvedType: Type): Type =
        unresolvedType.resolveType(function = this::getPartiallyResolvedType)

    /**
     * Establish an aliasing relation between [undecidedType1] and [undecidedType2].
     *
     * It will either return the known type that both share or an error indicating there is an inconsistency.
     */
    internal fun establishAliasing(
        undecidedType1: UndecidedType,
        undecidedType2: UndecidedType,
        meet: (t1: Type, t2: Type) -> Type
    ): Type {
        val t1 = getPartiallyResolvedType(undecidedType = undecidedType1)
        val t2 = getPartiallyResolvedType(undecidedType = undecidedType2)
        if (t1 !is UndecidedType && t2 !is UndecidedType) {
            return meet(t1, t2)
        }
        val commonRoot = indexAliasingUnionFind.link(i = undecidedType1.index, j = undecidedType2.index)
        refreshKnownMappings()
        return knownResolutions[commonRoot] ?: undecidedType1
    }

    /**
     * Try to add the resolution decision for a (potentially) currently undecided type.
     *
     * It will either return an error indicating there is an inconsistency of knowledge or the best knowledge of the
     * known type.
     */
    internal fun addTypeResolution(undecidedTypeIndex: Int, decidedType: Type): Type {
        if (decidedType is UndecidedType) {
            error(message = "Use establishAliasing() instead!")
        }
        val rootOfUndecidedTypeIndex = undecidedTypeIndex.findRoot()
        val resolvedDecidedType = resolveType(unresolvedType = decidedType)
        val existingMapping = knownResolutions[rootOfUndecidedTypeIndex]
        if (existingMapping == null) {
            // If the mapping is entirely new, we can confidently use it.
            knownResolutions[rootOfUndecidedTypeIndex] = resolvedDecidedType
            // We need to refresh because we have more information.
            refreshKnownMappings()
            // Return the best knowledge we have.
            return knownResolutions[rootOfUndecidedTypeIndex]!!
        }
        return existingMapping
    }
}
