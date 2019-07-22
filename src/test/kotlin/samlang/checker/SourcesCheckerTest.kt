package samlang.checker

import io.kotlintest.specs.StringSpec
import samlang.ast.ModuleReference
import samlang.ast.Sources
import samlang.parser.ModuleBuilder

class SourcesCheckerTest : StringSpec({
    "Several sources integration test" {
        val sourceA = """
            class A {
                public function a(): int = 42
            }
        """.trimIndent()
        val sourceB = """
            import { A } from A
            
            class B(value: int) {
                public function of(): B = { value: A::a() }
                public method intValue(): int = this.value
            }
        """.trimIndent()
        val sourceC = """
            import { B } from B
            
            class C(Int(int), B(B)) {
                public function ofInt(value: int): C = Int(value)
                public function ofB(b: B): C = B(b)
                public method intValue(): int =
                    match (this) {
                        | Int v -> v
                        | B b -> b::intValue()
                    }
            }
        """.trimIndent()
        val sourceD = """
            import { A } from A
            import { B } from B
            import { C } from C
            
            class IdentifyChecker {
                public function equals(c1: C, c2: C): bool = c1::intValue() == c2::intValue() 
            }
            
            class Main {
                function main(): bool = 
                    IdentifyChecker::equals(C::ofInt(A::a()), C::ofB(B::of()))
            }
        """.trimIndent()
        val sources = Sources(
            moduleMappings = mapOf(
                ModuleReference(moduleName = "A") to ModuleBuilder.buildModuleFromText(file = "A.sam", text = sourceA),
                ModuleReference(moduleName = "B") to ModuleBuilder.buildModuleFromText(file = "B.sam", text = sourceB),
                ModuleReference(moduleName = "C") to ModuleBuilder.buildModuleFromText(file = "C.sam", text = sourceC),
                ModuleReference(moduleName = "D") to ModuleBuilder.buildModuleFromText(file = "D.sam", text = sourceD)
            )
        )
        typeCheckSources(sources = sources)
    }
})
