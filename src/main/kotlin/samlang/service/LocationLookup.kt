package samlang.service

import samlang.ast.common.Location
import samlang.ast.common.ModuleReference
import samlang.ast.common.Position
import samlang.ast.common.Range

/**
 * An entity lookup service against a given location.
 *
 * @param E type of the entity to lookup against location.
 */
class LocationLookup<E : Any> {

    /**
     * Mapping from module reference to a list of (entity, position range of entity)
     */
    private val locationTable: MutableMap<ModuleReference, MutableMap<Range, E>> = mutableMapOf()

    fun get(moduleReference: ModuleReference, position: Position): E? {
        val location = getBestLocation(moduleReference = moduleReference, position = position) ?: return null
        val localTable = locationTable[location.moduleReference]
            ?: error(message = "Bad getBestLocation implementation!")
        return localTable[location.range] ?: error(message = "Bad getBestLocation implementation!")
    }

    operator fun set(location: Location, entity: E) {
        val (sourcePath, range) = location
        val localMap = locationTable[sourcePath]
        if (localMap == null) {
            locationTable[sourcePath] = hashMapOf(range to entity)
        } else {
            localMap[range] = entity
        }
    }

    /**
     * Visible for testing.
     *
     * @return the narrowest possible location correspond to given [position] at [moduleReference]. If there is no
     * location that contains the given position, `null` is returned.
     */
    internal fun getBestLocation(moduleReference: ModuleReference, position: Position): Location? {
        val fileLocationMap = locationTable[moduleReference] ?: return null
        var bestWeight = Int.MAX_VALUE
        var bestLocation: Location? = null
        for (range in fileLocationMap.keys) {
            // Weight calculation is adapted from the heuristics in
            // https://github.com/facebook/pyre-check/blob/master/analysis/lookup.ml
            if (position !in range) {
                continue
            }
            val weight = (range.end.line - range.start.line) * 1000 + (range.end.column - range.start.column)
            if (weight < bestWeight) {
                bestWeight = weight
                bestLocation = Location(moduleReference = moduleReference, range = range)
            }
        }
        return bestLocation
    }
}
