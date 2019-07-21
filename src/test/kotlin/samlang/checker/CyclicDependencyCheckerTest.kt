package samlang.checker

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.Module
import samlang.ast.ModuleMembersImport
import samlang.ast.ModuleReference
import samlang.ast.Range

class CyclicDependencyCheckerTest : StringSpec() {

    private fun String.toMockModuleReference(): ModuleReference =
        ModuleReference(range = Range.DUMMY, parts = listOf(this))

    private fun checkErrors(sources: List<Pair<String, List<String>>>, expectedErrors: Set<String>) {
        CyclicDependencyChecker().apply {
            for ((name, imports) in sources) {
                this.addImports(
                    moduleReference = name.toMockModuleReference(),
                    module = Module(imports = imports.map {
                        ModuleMembersImport(
                            range = Range.DUMMY,
                            moduleReference = it.toMockModuleReference(),
                            importedMembers = emptyList()
                        )
                    }, classDefinitions = emptyList())
                )
            }
        }.getCyclicDependencyErrors().map { it.errorMessage }.toSet() shouldBe expectedErrors
    }

    init {
        "Empty graph has no errors." {
            checkErrors(sources = emptyList(), expectedErrors = emptySet())
        }
        "Singleton graph has no errors." {
            checkErrors(sources = listOf("NAME" to listOf("DEP1")), expectedErrors = emptySet())
        }
        "Expect simple cyclic dependency error." {
            checkErrors(
                sources = listOf(
                    "S1" to listOf("S2"),
                    "S2" to listOf("S1")
                ),
                expectedErrors = setOf("S2.sam:0:0-0:0: [CyclicDependency]: S1->S2->S1.")
            )
        }
        "Expect length-5 cyclic dependency error." {
            checkErrors(
                sources = listOf(
                    "S1" to listOf("S2"),
                    "S2" to listOf("S3"),
                    "S3" to listOf("S4"),
                    "S4" to listOf("S5"),
                    "S5" to listOf("S6"),
                    "S6" to listOf("S1")
                ),
                expectedErrors = setOf("S6.sam:0:0-0:0: [CyclicDependency]: S1->S2->S3->S4->S5->S6->S1.")
            )
        }
        "Expect length-3 cyclic dependency error after DFS." {
            checkErrors(
                sources = listOf(
                    "S1" to listOf("S2"),
                    "S2" to listOf("S3"),
                    "S3" to listOf("S4"),
                    "S4" to listOf("S5"),
                    "S5" to listOf("S6"),
                    "S6" to listOf("S4")
                ),
                expectedErrors = setOf("S6.sam:0:0-0:0: [CyclicDependency]: S4->S5->S6->S4.")
            )
        }
        "Expect multiple errors in one traversal." {
            checkErrors(
                sources = listOf(
                    "S1" to listOf("S2"),
                    "S2" to listOf("S3", "S5"),
                    "S3" to listOf("S4"),
                    "S4" to listOf("S3"),
                    "S5" to listOf("S6"),
                    "S6" to listOf("S5")
                ),
                expectedErrors = setOf(
                    "S4.sam:0:0-0:0: [CyclicDependency]: S3->S4->S3.",
                    "S6.sam:0:0-0:0: [CyclicDependency]: S5->S6->S5."
                )
            )
        }
        "Expect multiple errors in all traversals." {
            checkErrors(
                sources = listOf(
                    "S1" to listOf("S2"),
                    "S2" to listOf("S1"),
                    "S3" to listOf("S4"),
                    "S4" to listOf("S5"),
                    "S5" to listOf("S3"),
                    "S6" to listOf("S7"),
                    "S7" to listOf("S6")
                ),
                expectedErrors = setOf(
                    "S2.sam:0:0-0:0: [CyclicDependency]: S1->S2->S1.",
                    "S5.sam:0:0-0:0: [CyclicDependency]: S3->S4->S5->S3.",
                    "S7.sam:0:0-0:0: [CyclicDependency]: S6->S7->S6."
                )
            )
        }
    }
}
