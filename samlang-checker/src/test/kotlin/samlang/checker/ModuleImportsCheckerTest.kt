package samlang.checker

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.common.Range
import samlang.ast.common.TypeDefinition
import samlang.ast.common.TypeDefinitionType
import samlang.ast.lang.ClassDefinition
import samlang.ast.lang.Module
import samlang.ast.common.ModuleMembersImport
import samlang.ast.common.ModuleReference
import samlang.ast.common.Sources

class ModuleImportsCheckerTest : StringSpec() {

    private fun createMockClass(name: String): ClassDefinition =
        ClassDefinition(
            range = Range.DUMMY,
            name = name,
            nameRange = Range.DUMMY,
            typeDefinition = TypeDefinition(
                range = Range.DUMMY,
                type = TypeDefinitionType.OBJECT,
                typeParameters = emptyList(),
                mappings = emptyMap()
            ),
            members = emptyList()
        )

    private fun createMockModule(
        name: String,
        imports: List<Pair<String, List<String>>> = emptyList(),
        members: List<String> = emptyList()
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
            classDefinitions = members.map(transform = ::createMockClass)
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
        errorCollector.collectedErrors.map { it.errorMessage } shouldBe errors
    }

    init {
        "Empty sources have no error." {
            checkErrors(modules = emptyList(), errors = emptyList())
        }
        "No import sources have no errors." {
            checkErrors(
                modules = listOf(
                    createMockModule(name = "A"),
                    createMockModule(name = "B", members = listOf("foo")),
                    createMockModule(name = "C", members = listOf("bar"))
                ),
                errors = listOf()
            )
        }
        "Cyclic dependency causes no errors." {
            checkErrors(
                modules = listOf(
                    createMockModule(name = "A", imports = listOf("B" to listOf("Bar")), members = listOf("Foo")),
                    createMockModule(name = "B", imports = listOf("A" to listOf("Foo")), members = listOf("Bar"))
                ),
                errors = listOf()
            )
        }
        "Missing classes cause errors." {
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
    }
}
