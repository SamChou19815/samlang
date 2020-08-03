package samlang.checker

import kotlin.test.Test
import samlang.ast.common.ModuleReference
import samlang.ast.common.Sources
import samlang.errors.CompilationFailedException
import samlang.parser.buildModuleFromText

class SourcesCheckerTest {
    @Test
    fun typeCheckWithSeveralSourcesIntegrationTest() {
        val sourceA = """
            class A {
                function a(): int = 42
            }
        """.trimIndent()
        val sourceB = """
            import { A } from A

            class B(val value: int) {
                function of(): B = { value: A.a() }
                method intValue(): int = this.value
            }
        """.trimIndent()
        val sourceC = """
            import { B } from B

            class C(Int(int), B(B)) {
                function ofInt(value: int): C = Int(value)
                function ofB(b: B): C = B(b)
                method intValue(): int =
                    match (this) {
                        | Int v -> v
                        | B b -> b.intValue()
                    }
            }
        """.trimIndent()
        val sourceD = """
            import { A } from A
            import { B } from B
            import { C } from C

            class IdentifyChecker {
                function equals(c1: C, c2: C): bool = c1.intValue() == c2.intValue()
            }

            class Main {
                function main(): bool =
                    IdentifyChecker.equals(C.ofInt(A.a()), C.ofB(B.of()))
            }
        """.trimIndent()
        val sources = Sources(
            moduleMappings = mapOf(
                ModuleReference(moduleName = "A") to buildModuleFromText(
                    moduleReference = ModuleReference(moduleName = "A"),
                    text = sourceA
                ).first,
                ModuleReference(moduleName = "B") to buildModuleFromText(
                    moduleReference = ModuleReference(moduleName = "B"),
                    text = sourceB
                ).first,
                ModuleReference(moduleName = "C") to buildModuleFromText(
                    moduleReference = ModuleReference(moduleName = "C"),
                    text = sourceC
                ).first,
                ModuleReference(moduleName = "D") to buildModuleFromText(
                    moduleReference = ModuleReference(moduleName = "D"),
                    text = sourceD
                ).first
            )
        )
        val errorCollector = ErrorCollector()
        typeCheckSources(sources = sources, errorCollector = errorCollector)
        if (errorCollector.collectedErrors.isNotEmpty()) {
            throw CompilationFailedException(errors = errorCollector.collectedErrors)
        }
    }
}
