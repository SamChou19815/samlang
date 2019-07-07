package samlang.checker

import samlang.ast.TypeExpression
import samlang.ast.TypeExpression.*
import samlang.ast.TypeExpressionVisitor
import samlang.util.UnionFind

class UndecidedTypeManager {

    /**
     * Invariant: it's guaranteed that all the undecided types produced here's indices can be used here without error.
     */

    /**
     * The union find used to manage the potential complex aliasing relation between different undecided types.
     */
    private val indexAliasingUnionFind: UnionFind = UnionFind()
    /**
     * A collection of known mappings between the undecided type index and the decided types.
     * In particular:
     * - the key of the map is almost the root index in the above union find.
     * - the value of the map always represents the best knowledge of the type. i.e. we try to resolve as many undecided
     *   type as possible.
     */
    private val knownMappings: MutableMap<Int, TypeExpression> = mutableMapOf()

    override fun toString(): String = "[indexAliasingUnionFind: $indexAliasingUnionFind, knownMappings: $knownMappings"

    /**
     * Find the root of an index.
     */
    private val Int.root get() = indexAliasingUnionFind.find(i = this)

    /**
     * Refresh all the known mappings to ensure it represents the best knowledge we have.
     * Need to be called after each update in the knownMappings or aliasing relation.
     */
    private fun refreshKnownMappings() {
        val keyCorrectMappings = knownMappings.mapKeys { (k, _) -> indexAliasingUnionFind.find(i = k) }
        knownMappings.clear()
        knownMappings.putAll(from = keyCorrectMappings)
        knownMappings.replaceAll { _, currentValue -> resolveType(unresolvedType = currentValue) }
    }

    /**
     * Report the current reference to the undecided type.
     */
    fun reportCurrentUndecidedTypeReference(undecidedType: UndecidedType): TypeExpression {
        val rootIndex = undecidedType.index.root
        return knownMappings[rootIndex] ?: undecidedType
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
        val t1 = reportCurrentUndecidedTypeReference(undecidedType = undecidedType1)
        val t2 = reportCurrentUndecidedTypeReference(undecidedType = undecidedType2)
        if (t1 !is UndecidedType && t2 !is UndecidedType) {
            t1.resolve(t2)
        }
        val commonRoot = indexAliasingUnionFind.link(i = undecidedType1.index, j = undecidedType2.index)
        refreshKnownMappings()
        return knownMappings[commonRoot] ?: undecidedType1
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
        val existingMapping = knownMappings[rootOfUndecidedTypeIndex]
        if (existingMapping == null) {
            // If the mapping is entirely new, we can confidently use it.
            knownMappings[rootOfUndecidedTypeIndex] = resolvedDecidedType
            // We need to refresh because we have more information.
            refreshKnownMappings()
            // Return the best knowledge we have.
            return knownMappings[rootOfUndecidedTypeIndex]!!
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
            context.reportCurrentUndecidedTypeReference(undecidedType = typeExpression)

    }

}
