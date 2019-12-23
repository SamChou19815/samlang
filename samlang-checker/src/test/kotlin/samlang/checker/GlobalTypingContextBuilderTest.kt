package samlang.checker

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
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

class GlobalTypingContextBuilderTest : StringSpec() {
    init {
        "can handle imports and definitions" {
            val module0Reference = ModuleReference(moduleName = "Module0")
            val module1Reference = ModuleReference(moduleName = "Module1")
            val typeDefinition = TypeDefinition.ofDummy()
            val class0 = ClassDefinition(
                range = Range.DUMMY,
                name = "Class0",
                nameRange = Range.DUMMY,
                typeDefinition = typeDefinition,
                members = emptyList()
            )
            val class1 = ClassDefinition(
                range = Range.DUMMY,
                name = "Class1",
                nameRange = Range.DUMMY,
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
                classDefinitions = listOf(class1)
            )
            val sources = Sources(moduleMappings = mapOf(module0Reference to module0, module1Reference to module1))
            val commonClassType = ClassType(
                typeDefinition = typeDefinition, methods = persistentMapOf(), functions = persistentMapOf()
            )
            GlobalTypingContextBuilder.buildGlobalTypingContext(sources = sources) shouldBe GlobalTypingContext(
                modules = persistentMapOf(
                    module0Reference to ModuleTypingContext(classes = persistentMapOf("Class0" to commonClassType)),
                    module1Reference to ModuleTypingContext(
                        classes = persistentMapOf("Class0" to commonClassType, "Class1" to commonClassType)
                    )
                )
            )
        }
    }
}
