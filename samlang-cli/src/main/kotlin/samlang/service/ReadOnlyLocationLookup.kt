package samlang.service

import samlang.ast.common.ModuleReference
import samlang.ast.common.Position

/**
 * A readonly entity lookup service against a given location.
 *
 * @param E type of the entity to lookup against location.
 */
interface ReadOnlyLocationLookup<E : Any> {
    fun get(moduleReference: ModuleReference, position: Position): E?
}
