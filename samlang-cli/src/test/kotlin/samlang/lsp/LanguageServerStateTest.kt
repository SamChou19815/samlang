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
        "State can handle complex dependency patterns." {
            val state = LanguageServerState(configuration = Configuration.parse())
            val test1ModuleReference = ModuleReference(moduleName = "Test1")
            val test2ModuleReference = ModuleReference(moduleName = "Test2")
            state.update(
                moduleReference = test1ModuleReference,
                sourceCode = """
                    class Test1 {
                      function test(): int = "haha"
                    }
                """.trimIndent()
            )
            state.update(
                moduleReference = test2ModuleReference,
                sourceCode = """
                    import { Test1, Test2 } from Test1
                    
                    class Test2 {
                      function test(): string = 3
                    }
                """.trimIndent()
            )
            state.getErrors(moduleReference = test1ModuleReference).size shouldBe 1
            state.getErrors(moduleReference = test2ModuleReference).size shouldBe 2
            // Adding Test2 can clear one error of its reverse dependency.
            state.update(
                moduleReference = test1ModuleReference,
                sourceCode = """
                    class Test1 {
                      function test(): int = "haha"
                    }
                    class Test2 {}
                """.trimIndent()
            )
            state.getErrors(moduleReference = test1ModuleReference).size shouldBe 1
            state.getErrors(moduleReference = test2ModuleReference).size shouldBe 1
            // Clearing local error of Test1
            state.update(
                moduleReference = test1ModuleReference,
                sourceCode = """
                    class Test1 {
                      function test(): int = 3
                    }
                """.trimIndent()
            )
            state.getErrors(moduleReference = test1ModuleReference).size shouldBe 0
            state.getErrors(moduleReference = test2ModuleReference).size shouldBe 2
            // Clearing local error of Test2
            state.update(
                moduleReference = test2ModuleReference,
                sourceCode = """
                    import { Test1, Test2 } from Test1
                    
                    class Test2 {
                      function test(): string = "haha"
                    }
                """.trimIndent()
            )
            state.getErrors(moduleReference = test1ModuleReference).size shouldBe 0
            state.getErrors(moduleReference = test2ModuleReference).size shouldBe 1
            // Clearing all errors of Test2
            state.update(
                moduleReference = test2ModuleReference,
                sourceCode = """
                    import { Test1 } from Test1
                    
                    class Test2 {
                      function test(): string = "haha"
                    }
                """.trimIndent()
            )
            state.getErrors(moduleReference = test1ModuleReference).size shouldBe 0
            state.getErrors(moduleReference = test2ModuleReference).size shouldBe 0
        }
    }
}
