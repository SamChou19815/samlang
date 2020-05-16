package samlang.checker

import kotlin.test.Test
import kotlin.test.assertEquals
import samlang.ast.common.ModuleMembersImport
import samlang.ast.common.ModuleReference
import samlang.ast.common.Range
import samlang.ast.common.Sources
import samlang.ast.lang.Module

class CyclicDependencyCheckerTest {
    private fun checkErrors(sources: List<Pair<String, List<String>>>, expectedErrors: List<String>) {
        // Use LinkedHashMap to have nice order
        val moduleMappings = LinkedHashMap<ModuleReference, Module>()
        for ((name, imports) in sources) {
            moduleMappings[ModuleReference(moduleName = name)] = Module(
                imports = imports.map {
                    ModuleMembersImport(
                        range = Range.DUMMY,
                        importedMembers = emptyList(),
                        importedModule = ModuleReference(moduleName = it),
                        importedModuleRange = Range.DUMMY
                    )
                },
                classDefinitions = emptyList()
            )
        }
        val errorCollector = ErrorCollector()
        getTypeCheckingOrder(sources = Sources(moduleMappings = moduleMappings), errorCollector = errorCollector)
        assertEquals(expected = expectedErrors, actual = errorCollector.collectedErrors.map { it.errorMessage })
    }

    @Test
    fun emptyGraphHasNoErrors() {
        checkErrors(sources = emptyList(), expectedErrors = emptyList())
    }

    @Test
    fun singletonGraphHasNoErrors() {
        checkErrors(sources = listOf("NAME" to listOf("DEP1")), expectedErrors = emptyList())
    }

    @Test
    fun expectSingleCyclicDependencyError() {
        checkErrors(
            sources = listOf(
                "S1" to listOf("S2"),
                "S2" to listOf("S1")
            ),
            expectedErrors = listOf("S2.sam:0:0-0:0: [CyclicDependency]: S1->S2->S1.")
        )
    }

    @Test
    fun expectLength5CyclicDependencyError() {
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

    @Test
    fun expectLength3CyclicDependencyErrorAfterDFS() {
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

    @Test
    fun expectMultipleErrorsInOneTraversal() {
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

    @Test
    fun expectMultipleErrorsInAllTraversals() {
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
