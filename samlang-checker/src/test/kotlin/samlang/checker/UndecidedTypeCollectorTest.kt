package samlang.checker

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.common.Type

class UndecidedTypeCollectorTest : StringSpec() {
    init {
        "Can correctly find all undecided types." {
            collectUndecidedTypeIndices(
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
            ).toSet() shouldBe setOf(0, 1, 2, 3)
        }
    }
}
