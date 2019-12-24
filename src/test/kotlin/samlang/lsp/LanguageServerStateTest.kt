package samlang.lsp

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.Configuration
import samlang.ast.common.ModuleReference

class LanguageServerStateTest : StringSpec() {
    init {
        "State can initialize." {
            LanguageServerState(configuration = Configuration.parse())
        }
        "State can update." {
            val state = LanguageServerState(configuration = Configuration.parse())
            state.update(
                moduleReference = ModuleReference(moduleName = "test"),
                sourceCode = """
                    class Test {
                      function test(): int = "haha"
                    }
                """.trimIndent()
            )
            state.allErrors.size shouldBe 1
            state.getErrors(moduleReference = ModuleReference(moduleName = "test")).size shouldBe 1
            state.remove(moduleReference = ModuleReference(moduleName = "test"))
            state.allErrors.size shouldBe 0
            state.getErrors(moduleReference = ModuleReference(moduleName = "test")).size shouldBe 0
        }
    }
}
