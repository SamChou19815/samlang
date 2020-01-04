package samlang.checker

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.common.Type

class TypeUndeciderTest : StringSpec() {
    init {
        "Can undecide one big nested type." {
            val source = Type.FunctionType(
                argumentTypes = listOf(
                    Type.IdentifierType(
                        identifier = "A",
                        typeArguments = listOf(Type.bool, Type.id(identifier = "T1"))
                    ),
                    Type.unit,
                    Type.unit,
                    Type.TupleType(mappings = listOf(Type.id(identifier = "T2")))
                ),
                returnType = Type.TupleType(mappings = listOf(Type.id(identifier = "T3"), Type.id(identifier = "T4")))
            )
            undecideTypeParameters(type = source, typeParameters = listOf("T1", "T2", "T3", "T4")).first shouldBe
                    Type.FunctionType(
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
        }
    }
}
