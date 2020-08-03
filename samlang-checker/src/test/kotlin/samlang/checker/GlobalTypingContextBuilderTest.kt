package samlang.checker

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.collections.immutable.persistentMapOf
import samlang.ast.common.ModuleMembersImport
import samlang.ast.common.ModuleReference
import samlang.ast.common.Range
import samlang.ast.common.Sources
import samlang.ast.common.TypeDefinition
import samlang.ast.lang.ClassDefinition
import samlang.ast.lang.Module
import samlang.checker.GlobalTypingContext.ClassType
import samlang.checker.GlobalTypingContext.ModuleTypingContext

class GlobalTypingContextBuilderTest {
    @Test
    fun canHandleImportsAndDefinitions() {
        val module0Reference = ModuleReference(moduleName = "Module0")
        val module1Reference = ModuleReference(moduleName = "Module1")
        val typeDefinition = TypeDefinition.ofDummy()
        val class0 = ClassDefinition(
            range = Range.DUMMY,
            name = "Class0",
            nameRange = Range.DUMMY,
            isPublic = true,
            typeDefinition = typeDefinition,
            members = emptyList()
        )
        val class1 = ClassDefinition(
            range = Range.DUMMY,
            name = "Class1",
            nameRange = Range.DUMMY,
            isPublic = true,
            typeDefinition = typeDefinition,
            members = emptyList()
        )
        val class2 = ClassDefinition(
            range = Range.DUMMY,
            name = "Class1",
            nameRange = Range.DUMMY,
            isPublic = false,
            typeDefinition = typeDefinition,
            members = emptyList()
        )
        val module0 = Module(imports = emptyList(), classDefinitions = listOf(class0))
        val module1 = Module(
            imports = listOf(
                ModuleMembersImport(
                    range = Range.DUMMY,
                    importedModuleRange = Range.DUMMY,
                    importedModule = module0Reference,
                    importedMembers = listOf("Class0" to Range.DUMMY)
                )
            ),
            classDefinitions = listOf(class1, class2)
        )
        val sources = Sources(moduleMappings = mapOf(module0Reference to module0, module1Reference to module1))
        val commonClassType = ClassType(
            typeDefinition = typeDefinition, methods = persistentMapOf(), functions = persistentMapOf()
        )
        val expected = GlobalTypingContext(
            modules = persistentMapOf(
                module0Reference to ModuleTypingContext(
                    definedClasses = persistentMapOf("Class0" to commonClassType),
                    importedClasses = persistentMapOf()
                ),
                module1Reference to ModuleTypingContext(
                    definedClasses = persistentMapOf("Class1" to commonClassType),
                    importedClasses = persistentMapOf("Class0" to commonClassType)
                )
            )
        )
        val actual = GlobalTypingContextBuilder.buildGlobalTypingContext(sources = sources)
        assertEquals(expected = expected, actual = actual)
    }
}
