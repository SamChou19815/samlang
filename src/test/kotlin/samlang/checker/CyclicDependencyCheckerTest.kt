package samlang.checker

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.Module
import samlang.ast.ModuleMembersImport
import samlang.ast.ModuleReference
import samlang.ast.Range
import samlang.ast.Sources

class CyclicDependencyCheckerTest : StringSpec() {

    private fun String.toMockModuleReference(): ModuleReference =
        ModuleReference(range = Range.DUMMY, parts = listOf(this))

    private fun checkErrors(sources: List<Pair<String, List<String>>>, expectedErrors: List<String>) {
        // Use LinkedHashMap to have nice order
        val moduleMappings = LinkedHashMap<ModuleReference, Module>()
        for ((name, imports) in sources) {
            moduleMappings[name.toMockModuleReference()] = Module(
                imports = imports.map {
                    ModuleMembersImport(
                        range = Range.DUMMY,
                        moduleReference = it.toMockModuleReference(),
                        importedMembers = emptyList()
                    )
                },
                classDefinitions = emptyList()
            )
        }
        val errorCollector = ErrorCollector()
        Sources(moduleMappings = moduleMappings).getTypeCheckingOrder(errorCollector = errorCollector)
        errorCollector.collectedErrors.map { it.errorMessage } shouldBe expectedErrors
    }

    init {
        "Empty graph has no errors." {
            checkErrors(sources = emptyList(), expectedErrors = emptyList())
        }
        "Singleton graph has no errors." {
            checkErrors(sources = listOf("NAME" to listOf("DEP1")), expectedErrors = emptyList())
        }
        "Expect simple cyclic dependency error." {
            checkErrors(
                sources = listOf(
                    "S1" to listOf("S2"),
                    "S2" to listOf("S1")
                ),
                expectedErrors = listOf("S2.sam:0:0-0:0: [CyclicDependency]: S1->S2->S1.")
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
                expectedErrors = listOf("S6.sam:0:0-0:0: [CyclicDependency]: S1->S2->S3->S4->S5->S6->S1.")
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
                expectedErrors = listOf("S6.sam:0:0-0:0: [CyclicDependency]: S4->S5->S6->S4.")
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
                expectedErrors = listOf(
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
                expectedErrors = listOf(
                    "S2.sam:0:0-0:0: [CyclicDependency]: S1->S2->S1.",
                    "S5.sam:0:0-0:0: [CyclicDependency]: S3->S4->S5->S3.",
                    "S7.sam:0:0-0:0: [CyclicDependency]: S6->S7->S6."
                )
            )
        }
    }
}
