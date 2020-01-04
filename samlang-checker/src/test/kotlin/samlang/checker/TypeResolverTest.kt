package samlang.checker

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.common.Type

class TypeResolverTest : StringSpec() {
    init {
        "Won't affect primitive types." {
            resolve(type = Type.unit) shouldBe Type.unit
            resolve(type = Type.bool) shouldBe Type.bool
            resolve(type = Type.int) shouldBe Type.int
            resolve(type = Type.string) shouldBe Type.string
        }
        "Undecided type will be resolved." {
            resolve(type = Type.UndecidedType(index = 0)) shouldBe Type.unit
            resolve(type = Type.UndecidedType(index = 1)) shouldBe Type.bool
            resolve(type = Type.UndecidedType(index = 2)) shouldBe Type.int
            resolve(type = Type.UndecidedType(index = 3)) shouldBe Type.string
            resolve(type = Type.UndecidedType(index = 4)) shouldBe Type.unit
            resolve(type = Type.UndecidedType(index = 5)) shouldBe Type.bool
            resolve(type = Type.UndecidedType(index = 6)) shouldBe Type.int
            resolve(type = Type.UndecidedType(index = 7)) shouldBe Type.string
        }
        "Recursive types will be resolved." {
            resolve(
                type = Type.id(
                    identifier = "A",
                    typeArguments = listOf(Type.UndecidedType(index = 0), Type.UndecidedType(index = 1))
                )
            ) shouldBe Type.id(identifier = "A", typeArguments = listOf(Type.unit, Type.bool))
            resolve(
                type = Type.TupleType(mappings = listOf(Type.UndecidedType(index = 0), Type.UndecidedType(index = 1)))
            ) shouldBe Type.TupleType(mappings = listOf(Type.unit, Type.bool))
            resolve(
                type = Type.FunctionType(
                    argumentTypes = listOf(Type.UndecidedType(index = 0), Type.UndecidedType(index = 1)),
                    returnType = Type.UndecidedType(index = 2)
                )
            ) shouldBe Type.FunctionType(argumentTypes = listOf(Type.unit, Type.bool), returnType = Type.int)
        }
    }

    companion object {
        val resolver: (Type.UndecidedType) -> Type = { (index) ->
            when (index % 4) {
                0 -> Type.unit
                1 -> Type.bool
                2 -> Type.int
                3 -> Type.string
                else -> error(message = "Impossible")
            }
        }

        private fun resolve(type: Type): Type = resolveType(type = type, function = resolver)
    }
}
