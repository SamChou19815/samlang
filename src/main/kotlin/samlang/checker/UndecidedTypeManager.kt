package samlang.checker

import samlang.ast.checked.CheckedTypeExpr
import samlang.ast.checked.CheckedTypeExpr.*
import samlang.ast.checked.CheckedTypeExprVisitor
import samlang.util.Either
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
     *   type as possible. It implies that it should never contain a child that IS an undecided type.
     */
    private val knownMappings: MutableMap<Int, CheckedTypeExpr> = mutableMapOf()

    override fun toString(): String = "[indexAliasingUnionFind: $indexAliasingUnionFind, knownMappings: $knownMappings"

    /**
     * Legally allocate a new undecided type.
     */
    fun allocateAnUndecidedType(): UndecidedType {
        val t = UndecidedType(index = indexAliasingUnionFind.capacity)
        indexAliasingUnionFind.extend()
        return t
    }

    /**
     * Legally allocate a list of undecided types.
     */
    fun allocateUndecidedTypes(amount: Int): List<UndecidedType> {
        val list = arrayListOf<UndecidedType>()
        val startIndex = indexAliasingUnionFind.capacity
        for (i in 0 until amount) {
            list.add(element = UndecidedType(index = i + startIndex))
        }
        indexAliasingUnionFind.extend(additionalSize = amount)
        return list
    }

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
        knownMappings.replaceAll { _, currentValue ->
            resolveType(unresolvedType = currentValue)
        }
    }

    /**
     * Report the current reference to the undecided type.
     */
    fun reportCurrentUndecidedTypeReference(index: Int): CheckedTypeExpr {
        val rootIndex = index.root
        return knownMappings[rootIndex] ?: UndecidedType(index = rootIndex)
    }

    /**
     * Fully resolve an potentially [unresolvedType].
     */
    fun resolveType(unresolvedType: CheckedTypeExpr) : CheckedTypeExpr =
        unresolvedType.accept(visitor = TypeResolverVisitor, context = this@UndecidedTypeManager)

    /**
     * Establish an aliasing relation between [index1] and [index2].
     *
     * It will either return the known type that both share or an error indicating there is an inconsistency.
     */
    fun establishAliasing(index1: Int, index2: Int): Either<CheckedTypeExpr, InconsistentTypeReport> {
        val t1 = reportCurrentUndecidedTypeReference(index = index1)
        val t2 = reportCurrentUndecidedTypeReference(index = index2)
        if (t1 !is UndecidedType && t2 !is UndecidedType && t1 != t2) {
            // Inconsistency!
            return Either.Right(v = InconsistentTypeReport(existingType = t1, newType = t2))
        }
        val commonRoot = indexAliasingUnionFind.link(i = index1, j = index2)
        refreshKnownMappings()
        return Either.Left(v = knownMappings[commonRoot] ?: UndecidedType(index = commonRoot))
    }

    /**
     * Try to report the decision for a (potentially) currently undecided type.
     *
     * It will either return an error indicating there is an inconsistency of knowledge or the best knowledge of the
     * known type.
     */
    fun tryReportDecisionForUndecidedType(
        undecidedTypeIndex: Int,
        decidedType: CheckedTypeExpr
    ): Either<CheckedTypeExpr, InconsistentTypeReport> {
        if (decidedType == FreeType) {
            error(message = "Free type can never be a decided type.")
        } else if (decidedType is UndecidedType) {
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
            return Either.Left(v = knownMappings[rootOfUndecidedTypeIndex]!!)
        }
        return if (existingMapping == resolvedDecidedType) {
            // It doesn't tell us anything new, but that's OK.
            Either.Left(v = existingMapping)
            // No need to update because we haven't changed anything.
        } else {
            // Inconsistency!
            Either.Right(v = InconsistentTypeReport(existingType = existingMapping, newType = resolvedDecidedType))
        }
    }

    data class InconsistentTypeReport(val existingType: CheckedTypeExpr, val newType: CheckedTypeExpr)

    private object TypeResolverVisitor : CheckedTypeExprVisitor<UndecidedTypeManager, CheckedTypeExpr> {

        override fun visit(typeExpr: UnitType, context: UndecidedTypeManager): CheckedTypeExpr = typeExpr
        override fun visit(typeExpr: IntType, context: UndecidedTypeManager): CheckedTypeExpr = typeExpr
        override fun visit(typeExpr: StringType, context: UndecidedTypeManager): CheckedTypeExpr = typeExpr
        override fun visit(typeExpr: BoolType, context: UndecidedTypeManager): CheckedTypeExpr = typeExpr

        private fun CheckedTypeExpr.resolveType(context: UndecidedTypeManager): CheckedTypeExpr =
            accept(visitor = TypeResolverVisitor, context = context)

        override fun visit(typeExpr: IdentifierType, context: UndecidedTypeManager): CheckedTypeExpr =
            typeExpr.copy(typeArgs = typeExpr.typeArgs?.map { it.resolveType(context = context) })

        override fun visit(typeExpr: TupleType, context: UndecidedTypeManager): CheckedTypeExpr =
            TupleType(mappings = typeExpr.mappings.map { it.resolveType(context = context) })

        override fun visit(typeExpr: FunctionType, context: UndecidedTypeManager): CheckedTypeExpr =
            FunctionType(
                argumentTypes = typeExpr.argumentTypes.map { it.resolveType(context = context) },
                returnType = typeExpr.returnType.resolveType(context = context)
            )

        override fun visit(typeExpr: UndecidedType, context: UndecidedTypeManager): CheckedTypeExpr =
            context.reportCurrentUndecidedTypeReference(index = typeExpr.index)

        override fun visit(typeExpr: FreeType, context: UndecidedTypeManager): CheckedTypeExpr =
            error(message = "You should not decide on this type.")
    }

}
