package samlang.checker

import io.kotlintest.shouldBe
import io.kotlintest.shouldThrow
import io.kotlintest.specs.StringSpec
import samlang.ast.common.Type

class TypeResolutionTest : StringSpec() {
    init {
        "can resolve basic disjoint types with sufficient information." {
            val resolution = TypeResolution()
            resolution.addTypeResolution(undecidedTypeIndex = 0, decidedType = Type.int) shouldBe Type.int
            resolution.addTypeResolution(undecidedTypeIndex = 1, decidedType = Type.bool) shouldBe Type.bool
            resolution.addTypeResolution(undecidedTypeIndex = 2, decidedType = Type.string) shouldBe Type.string
            resolution.addTypeResolution(undecidedTypeIndex = 3, decidedType = Type.unit) shouldBe Type.unit
            // Basic single element resolution.
            resolution.resolveType(unresolvedType = Type.UndecidedType(index = 0)) shouldBe Type.int
            resolution.resolveType(unresolvedType = Type.UndecidedType(index = 1)) shouldBe Type.bool
            resolution.resolveType(unresolvedType = Type.UndecidedType(index = 2)) shouldBe Type.string
            resolution.resolveType(unresolvedType = Type.UndecidedType(index = 3)) shouldBe Type.unit
            // Recursive resolution.
            resolution.resolveType(
                unresolvedType = Type.FunctionType(
                    argumentTypes = listOf(
                        Type.TupleType(
                            mappings = listOf(
                                Type.UndecidedType(index = 0),
                                Type.UndecidedType(index = 1)
                            )
                        ),
                        Type.UndecidedType(index = 2),
                        Type.FunctionType(
                            argumentTypes = emptyList(),
                            returnType = Type.unit
                        )
                    ),
                    returnType = Type.FunctionType(
                        argumentTypes = emptyList(),
                        returnType = Type.UndecidedType(index = 3)
                    )
                )
            ) shouldBe Type.FunctionType(
                argumentTypes = listOf(
                    Type.TupleType(mappings = listOf(Type.int, Type.bool)),
                    Type.string,
                    Type.FunctionType(argumentTypes = emptyList(), returnType = Type.unit)
                ),
                returnType = Type.FunctionType(argumentTypes = emptyList(), returnType = Type.unit)
            )
        }
        "can link together different type set." {
            val resolution = TypeResolution()
            resolution.addTypeResolution(undecidedTypeIndex = 0, decidedType = Type.int) shouldBe Type.int
            val simpleMeet = { t1: Type, t2: Type ->
                if (t1 == t2) t1 else error(message = "Inconsistency detected")
            }
            resolution.establishAliasing(
                undecidedType1 = Type.UndecidedType(index = 0),
                undecidedType2 = Type.UndecidedType(index = 1),
                meet = simpleMeet
            ) shouldBe Type.int
            resolution.addTypeResolution(undecidedTypeIndex = 2, decidedType = Type.bool) shouldBe Type.bool
            shouldThrow<IllegalStateException> {
                resolution.establishAliasing(
                    undecidedType1 = Type.UndecidedType(index = 0),
                    undecidedType2 = Type.UndecidedType(index = 2),
                    meet = simpleMeet
                )
            }
            resolution.resolveType(unresolvedType = Type.UndecidedType(index = 0)) shouldBe Type.int
            resolution.resolveType(unresolvedType = Type.UndecidedType(index = 1)) shouldBe Type.int
            resolution.resolveType(unresolvedType = Type.UndecidedType(index = 2)) shouldBe Type.bool
        }
    }
}
