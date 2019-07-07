package samlang.checker

import samlang.ast.TypeExpression
import samlang.ast.TypeExpression.*
import samlang.ast.TypeExpressionVisitor
import samlang.util.UnionFind

class UndecidedTypeManager {
    /**
     * The union find used to manage the potential complex aliasing relation between different undecided types.
     */
    private val indexAliasingUnionFind: UnionFind = UnionFind()
    /**
     * A collection of known mappings between the undecided type index and the resolved types.
     * In particular:
     * - the key of the map is almost the root index in the above union find.
     * - the value of the map always represents the best knowledge of the type. i.e. we try to resolve as many undecided
     *   type as possible.
     */
    private val knownResolutions: MutableMap<Int, TypeExpression> = mutableMapOf()

    override fun toString(): String =
        "[indexAliasingUnionFind: $indexAliasingUnionFind, knownResolutions: $knownResolutions"

    /**
     * Find the root of an index.
     */
    private val Int.root get() = indexAliasingUnionFind.find(index = this)

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

    /**
     * Given an undecided type, try to find the partially resolved type (which may still contain nested undecided
     * types) and return it. If it's not found in the resolution, return the original undecided type.
     */
    fun getPartiallyResolvedType(undecidedType: UndecidedType): TypeExpression {
        val rootIndex = undecidedType.index.root
        return knownResolutions[rootIndex] ?: undecidedType
    }

    /**
     * Fully resolve an potentially [unresolvedType].
     */
    fun resolveType(unresolvedType: TypeExpression): TypeExpression =
        unresolvedType.accept(visitor = TypeResolverVisitor, context = this@UndecidedTypeManager)

    /**
     * Establish an aliasing relation between [undecidedType1] and [undecidedType2].
     *
     * It will either return the known type that both share or an error indicating there is an inconsistency.
     */
    internal fun establishAliasing(
        undecidedType1: UndecidedType,
        undecidedType2: UndecidedType,
        resolve: TypeExpression.(expected: TypeExpression) -> TypeExpression
    ): TypeExpression {
        val t1 = getPartiallyResolvedType(undecidedType = undecidedType1)
        val t2 = getPartiallyResolvedType(undecidedType = undecidedType2)
        if (t1 !is UndecidedType && t2 !is UndecidedType) {
            t1.resolve(t2)
        }
        val commonRoot = indexAliasingUnionFind.link(i = undecidedType1.index, j = undecidedType2.index)
        refreshKnownMappings()
        return knownResolutions[commonRoot] ?: undecidedType1
    }

    /**
     * Try to report the decision for a (potentially) currently undecided type.
     *
     * It will either return an error indicating there is an inconsistency of knowledge or the best knowledge of the
     * known type.
     */
    internal fun tryReportDecisionForUndecidedType(
        undecidedTypeIndex: Int,
        decidedType: TypeExpression,
        resolve: TypeExpression.(expected: TypeExpression) -> TypeExpression
    ): TypeExpression {
        if (decidedType is UndecidedType) {
            error(message = "Use establishAliasing() instead!")
        }
        val rootOfUndecidedTypeIndex = undecidedTypeIndex.root
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
        // Check whether the existing type is consistent with the newly resolved one.
        // They should be consistent because they are supposed to be merged together after this step.
        return resolvedDecidedType.resolve(existingMapping)
    }

    private object TypeResolverVisitor :
        TypeExpressionVisitor<UndecidedTypeManager, TypeExpression> {

        override fun visit(typeExpression: UnitType, context: UndecidedTypeManager): TypeExpression = typeExpression
        override fun visit(typeExpression: IntType, context: UndecidedTypeManager): TypeExpression = typeExpression
        override fun visit(typeExpression: StringType, context: UndecidedTypeManager): TypeExpression = typeExpression
        override fun visit(typeExpression: BoolType, context: UndecidedTypeManager): TypeExpression = typeExpression

        private fun TypeExpression.resolveType(context: UndecidedTypeManager): TypeExpression =
            accept(visitor = TypeResolverVisitor, context = context)

        override fun visit(typeExpression: IdentifierType, context: UndecidedTypeManager): TypeExpression =
            typeExpression.copy(typeArguments = typeExpression.typeArguments?.map { it.resolveType(context = context) })

        override fun visit(typeExpression: TupleType, context: UndecidedTypeManager): TypeExpression =
            typeExpression.copy(mappings = typeExpression.mappings.map { it.resolveType(context = context) })

        override fun visit(typeExpression: FunctionType, context: UndecidedTypeManager): TypeExpression =
            typeExpression.copy(
                argumentTypes = typeExpression.argumentTypes.map { it.resolveType(context = context) },
                returnType = typeExpression.returnType.resolveType(context = context)
            )

        override fun visit(typeExpression: UndecidedType, context: UndecidedTypeManager): TypeExpression =
            context.getPartiallyResolvedType(undecidedType = typeExpression)

    }

}
