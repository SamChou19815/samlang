package samlang.checker

import kotlin.test.Test
import kotlin.test.assertEquals
import samlang.ast.common.ModuleMembersImport
import samlang.ast.common.ModuleReference
import samlang.ast.common.Range
import samlang.ast.common.Sources
import samlang.ast.common.TypeDefinition
import samlang.ast.common.TypeDefinitionType
import samlang.ast.lang.ClassDefinition
import samlang.ast.lang.Module

class ModuleImportsCheckerTest {
    private fun createMockClass(name: String, isPublic: Boolean): ClassDefinition =
        ClassDefinition(
            range = Range.DUMMY,
            name = name,
            nameRange = Range.DUMMY,
            isPublic = isPublic,
            typeDefinition = TypeDefinition(
                range = Range.DUMMY,
                type = TypeDefinitionType.OBJECT,
                typeParameters = emptyList(),
                names = emptyList(),
                mappings = emptyMap()
            ),
            members = emptyList()
        )

    private fun createMockModule(
        name: String,
        imports: List<Pair<String, List<String>>> = emptyList(),
        members: List<Pair<String, Boolean>> = emptyList()
    ): Pair<String, Module> =
        name to Module(
            imports = imports.map { (name, members) ->
                ModuleMembersImport(
                    range = Range.DUMMY,
                    importedMembers = members.map { it to Range.DUMMY },
                    importedModule = ModuleReference(moduleName = name),
                    importedModuleRange = Range.DUMMY
                )
            },
            classDefinitions = members.map { (className, isPublic) ->
                createMockClass(name = className, isPublic = isPublic)
            }
        )

    private fun createMockSources(modules: List<Pair<String, Module>>): Sources<Module> =
        Sources(
            moduleMappings = LinkedHashMap<ModuleReference, Module>().apply {
                modules.forEach { (name, module) ->
                    this[ModuleReference(parts = listOf(name))] = module
                }
            }
        )

    private fun checkErrors(modules: List<Pair<String, Module>>, errors: List<String>) {
        val sources = createMockSources(modules = modules)
        val errorCollector = ErrorCollector()
        for ((moduleReference, module) in sources.moduleMappings) {
            val moduleErrorCollector = ErrorCollector()
            checkUndefinedImportsError(sources = sources, module = module, errorCollector = moduleErrorCollector)
            errorCollector.addErrorsWithModules(
                errorCollector = moduleErrorCollector,
                moduleReference = moduleReference
            )
        }
        assertEquals(expected = errors, actual = errorCollector.collectedErrors.map { it.errorMessage })
    }

    @Test
    fun emptySourcesHaveNoErrors() {
        checkErrors(modules = emptyList(), errors = emptyList())
    }

    @Test
    fun noImportSourcesHaveNoErrors() {
        checkErrors(
            modules = listOf(
                createMockModule(name = "A"),
                createMockModule(name = "B", members = listOf("foo" to true)),
                createMockModule(name = "C", members = listOf("bar" to true))
            ),
            errors = listOf()
        )
    }

    @Test
    fun cyclicDependencyCauseNoErrors() {
        checkErrors(
            modules = listOf(
                createMockModule(
                    name = "A",
                    imports = listOf("B" to listOf("Bar")),
                    members = listOf("Foo" to true)
                ),
                createMockModule(
                    name = "B",
                    imports = listOf("A" to listOf("Foo")),
                    members = listOf("Bar" to true)
                )
            ),
            errors = listOf()
        )
    }

    @Test
    fun missingClassesCausesErrors() {
        checkErrors(
            modules = listOf(
                createMockModule(name = "A", imports = listOf("B" to listOf("Foo", "Bar"))),
                createMockModule(name = "B", imports = listOf("A" to listOf("Foo", "Bar")))
            ),
            errors = listOf(
                "A.sam:0:0-0:0: [UnresolvedName]: Name `Foo` is not resolved.",
                "A.sam:0:0-0:0: [UnresolvedName]: Name `Bar` is not resolved.",
                "B.sam:0:0-0:0: [UnresolvedName]: Name `Foo` is not resolved.",
                "B.sam:0:0-0:0: [UnresolvedName]: Name `Bar` is not resolved."
            )
        )
    }

    @Test
    fun importingPrivateClassesCauseErrors() {
        checkErrors(
            modules = listOf(
                createMockModule(name = "A", members = listOf("Foo" to false)),
                createMockModule(name = "B", imports = listOf("A" to listOf("Foo")))
            ),
            errors = listOf("B.sam:0:0-0:0: [UnresolvedName]: Name `Foo` is not resolved.")
        )
    }
}
