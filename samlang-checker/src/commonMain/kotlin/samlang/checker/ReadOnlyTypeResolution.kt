package samlang.checker

import samlang.ast.common.Type
import samlang.ast.common.Type.UndecidedType

/** A provider of type resolution to previously undecided types. */
internal interface ReadOnlyTypeResolution {
    /**
     * Given an undecided type, try to find the partially resolved type (which may still contain nested undecided
     * types) and return it. If it's not found in the resolution, return the original undecided type.
     */
    fun getPartiallyResolvedType(undecidedType: UndecidedType): Type

    /** Fully resolve an potentially [unresolvedType]. */
    fun resolveType(unresolvedType: Type): Type
}
