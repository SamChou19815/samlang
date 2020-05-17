package samlang.service

import kotlin.test.Test
import kotlin.test.assertEquals
import samlang.ast.common.Location
import samlang.ast.common.ModuleReference
import samlang.ast.common.Position
import samlang.ast.common.Range

class LocationLookupTest {
    @Test
    fun selfConsistentTest() {
        val lookup = LocationLookup<Unit>()
        val farPosition = Position(line = 100, column = 100)
        val range = Range(start = Position(line = 1, column = 1), end = Position(line = 2, column = 2))
        val moduleReference = ModuleReference(moduleName = "foo")
        val location = Location(moduleReference = moduleReference, range = range)
        lookup[location] = Unit
        lookup.getBestLocation(moduleReference = moduleReference, position = range.start) shouldBe location
        lookup.getBestLocation(moduleReference = moduleReference, position = range.end) shouldBe location
        lookup.getBestLocation(moduleReference = moduleReference, position = farPosition) shouldBe null
        lookup.get(moduleReference = moduleReference, position = range.start) shouldBe Unit
        lookup.get(moduleReference = moduleReference, position = range.end) shouldBe Unit
        lookup.get(moduleReference = moduleReference, position = farPosition) shouldBe null
    }

    @Test
    fun getMethodFavorsSmallRange() {
        val lookup = LocationLookup<Int>()
        val moduleReference = ModuleReference(moduleName = "foo")
        val smallRange = Range(start = Position(line = 2, column = 1), end = Position(line = 3, column = 2))
        val smallLocation = Location(moduleReference = moduleReference, range = smallRange)
        val bigRange = Range(start = Position(line = 1, column = 1), end = Position(line = 30, column = 2))
        val bigLocation = Location(moduleReference = moduleReference, range = bigRange)
        lookup[smallLocation] = 1
        lookup[bigLocation] = 2
        lookup.getBestLocation(
            moduleReference = moduleReference,
            position = Position(line = 3, column = 1)
        ) shouldBe smallLocation
        lookup.getBestLocation(
            moduleReference = moduleReference,
            position = Position(line = 10, column = 2)
        ) shouldBe bigLocation
        lookup.getBestLocation(
            moduleReference = moduleReference,
            position = Position(line = 100, column = 100)
        ) shouldBe null
        lookup.get(moduleReference = moduleReference, position = Position(line = 3, column = 1)) shouldBe 1
        lookup.get(moduleReference = moduleReference, position = Position(line = 10, column = 2)) shouldBe 2
        lookup.get(moduleReference = moduleReference, position = Position(line = 100, column = 100)) shouldBe null
    }

    private infix fun <T> T.shouldBe(expected: T): Unit = assertEquals(expected = expected, actual = this)
}
