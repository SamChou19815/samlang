package samlang.checker

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.common.Type

class TypeValidatorTest : StringSpec() {
    init {
        "Good types are told to be good." {
            testWith(
                embeddedType = Type.id(
                    identifier = "Good",
                    typeArguments = listOf(Type.unit)
                )
            ) shouldBe null
            testWith(
                embeddedType = Type.id(
                    identifier = "Good",
                    typeArguments = listOf(Type.bool)
                )
            ) shouldBe null
            testWith(
                embeddedType = Type.id(
                    identifier = "Good",
                    typeArguments = listOf(Type.int)
                )
            ) shouldBe null
            testWith(
                embeddedType = Type.id(
                    identifier = "Good",
                    typeArguments = listOf(Type.string)
                )
            ) shouldBe null
        }
        "Bad types are told to be good." {
            testWith(
                embeddedType = Type.id(
                    identifier = "Good",
                    typeArguments = listOf(Type.unit, Type.unit)
                )
            ) shouldBe "Good"
            testWith(
                embeddedType = Type.id(
                    identifier = "Good",
                    typeArguments = listOf(Type.bool, Type.unit)
                )
            ) shouldBe "Good"
            testWith(
                embeddedType = Type.id(
                    identifier = "Good",
                    typeArguments = listOf(Type.int, Type.unit)
                )
            ) shouldBe "Good"
            testWith(
                embeddedType = Type.id(
                    identifier = "Good",
                    typeArguments = listOf(Type.string, Type.unit)
                )
            ) shouldBe "Good"
            testWith(
                embeddedType = Type.id(
                    identifier = "Bad",
                    typeArguments = listOf(Type.unit)
                )
            ) shouldBe "Bad"
            testWith(
                embeddedType = Type.id(
                    identifier = "Bad",
                    typeArguments = listOf(Type.bool)
                )
            ) shouldBe "Bad"
            testWith(
                embeddedType = Type.id(
                    identifier = "Bad",
                    typeArguments = listOf(Type.int)
                )
            ) shouldBe "Bad"
            testWith(
                embeddedType = Type.id(
                    identifier = "Bad",
                    typeArguments = listOf(Type.string)
                )
            ) shouldBe "Bad"
        }
    }

    private fun testWith(embeddedType: Type.IdentifierType): String? =
        validateType(
            type = Type.FunctionType(
                argumentTypes = listOf(Type.TupleType(mappings = listOf(Type.int))),
                returnType = Type.FunctionType(
                    argumentTypes = emptyList(),
                    returnType = Type.TupleType(mappings = listOf(Type.bool, embeddedType))
                )
            ),
            identifierTypeValidator = IdentifierTypeValidatorForTesting
        )

    private object IdentifierTypeValidatorForTesting : IdentifierTypeValidator {
        override fun identifierTypeIsWellDefined(name: String, typeArgumentLength: Int): Boolean =
            name == "Good" && typeArgumentLength == 1
    }
}
