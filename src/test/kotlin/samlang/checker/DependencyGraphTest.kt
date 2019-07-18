package samlang.checker

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.Range
import samlang.ast.Source
import samlang.errors.CyclicDependencyError

class DependencyGraphTest : StringSpec() {

    private fun checkErrors(sources: List<Pair<String, List<Pair<String, Range>>>>) {
        DependencyGraph().apply {
            for ((sourceName, imports) in sources) {
                this.addImports(sourceName = sourceName, source = Source(imports = imports, modules = emptyList()))
            }
        }.getCyclicDependencyErrors()
    }

    init {
        "Empty graph has no errors." {
            checkErrors(sources = emptyList())
        }
        "Singleton graph has no errors." {
            checkErrors(sources = listOf("NAME" to listOf("DEP1" to Range.DUMMY)))
        }
        "Expect simple cyclic dependency error." {
            try {
                checkErrors(
                    sources = listOf(
                        "S1" to listOf("S2" to Range.DUMMY),
                        "S2" to listOf("S1" to Range.DUMMY)
                    )
                )
            } catch (error: CyclicDependencyError) {
                error.errorMessage shouldBe "CyclicDependency:S1:0:0-0:0: S1->S2->S1."
            }
        }
        "Expect length-5 cyclic dependency error." {
            try {
                checkErrors(
                    sources = listOf(
                        "S1" to listOf("S2" to Range.DUMMY),
                        "S2" to listOf("S3" to Range.DUMMY),
                        "S3" to listOf("S4" to Range.DUMMY),
                        "S4" to listOf("S5" to Range.DUMMY),
                        "S5" to listOf("S6" to Range.DUMMY),
                        "S6" to listOf("S1" to Range.DUMMY)
                    )
                )
            } catch (error: CyclicDependencyError) {
                error.errorMessage shouldBe "CyclicDependency:S3:0:0-0:0: S3->S4->S5->S6->S1->S2->S3."
            }
        }
        "Expect length-3 cyclic dependency error after DFS." {
            try {
                checkErrors(
                    sources = listOf(
                        "S1" to listOf("S2" to Range.DUMMY),
                        "S2" to listOf("S3" to Range.DUMMY),
                        "S3" to listOf("S4" to Range.DUMMY),
                        "S4" to listOf("S5" to Range.DUMMY),
                        "S5" to listOf("S6" to Range.DUMMY),
                        "S6" to listOf("S4" to Range.DUMMY)
                    )
                )
            } catch (error: CyclicDependencyError) {
                error.errorMessage shouldBe "CyclicDependency:S4:0:0-0:0: S4->S5->S6->S4."
            }
        }
    }
}
