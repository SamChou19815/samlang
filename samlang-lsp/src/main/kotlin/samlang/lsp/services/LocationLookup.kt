package samlang.lsp.services

import samlang.ast.common.Location
import samlang.ast.common.Position
import samlang.ast.common.Range

/**
 * An entity lookup service against a given location.
 *
 * @param E type of the entity to lookup against location.
 */
class LocationLookup<E> {

    /**
     * Mapping from source path to a list of (entity, position range of entity)
     */
    private val locationTable: MutableMap<String, MutableMap<Range, E>> = mutableMapOf()

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
     * @return the narrowest possible location correspond to given [position] at [sourcePath]. If there is no location
     * that contains the given position, `null` is returned.
     */
    internal fun getBestLocation(sourcePath: String, position: Position): Location? {
        val fileLocationMap = locationTable[sourcePath] ?: return null
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
                bestLocation = Location(sourcePath = sourcePath, range = range)
            }
        }
        return bestLocation
    }
}
