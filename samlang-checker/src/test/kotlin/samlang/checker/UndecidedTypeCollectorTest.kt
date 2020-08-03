package samlang.checker

import kotlin.test.Test
import kotlin.test.assertEquals
import samlang.ast.common.Type

class UndecidedTypeCollectorTest {
    @Test
    fun canCorrectlyFindAllUndecidedTypes() {
        val actual = UndecidedTypeCollector.collectUndecidedTypeIndices(
            type = Type.FunctionType(
                argumentTypes = listOf(
                    Type.IdentifierType(
                        identifier = "A",
                        typeArguments = listOf(Type.bool, Type.UndecidedType(index = 0))
                    ),
                    Type.unit,
                    Type.unit,
                    Type.TupleType(mappings = listOf(Type.UndecidedType(index = 1)))
                ),
                returnType = Type.TupleType(
                    mappings = listOf(
                        Type.UndecidedType(index = 2),
                        Type.UndecidedType(index = 3)
                    )
                )
            )
        ).toSet()
        assertEquals(expected = setOf(0, 1, 2, 3), actual = actual)
    }
}
