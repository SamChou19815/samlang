package samlang.server

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import java.util.concurrent.ThreadFactory

class WebDemoControllerTest : StringSpec() {

    private val threadFactory: ThreadFactory = ThreadFactory { runnable -> Thread(runnable) }

    init {
        "good-program-gets-good-result" {
            val resp = WebDemoController.interpret(
                programString =
                """
                    class Main {
                        function main(): int = 42
                    }
                """.trimIndent(),
                threadFactory = threadFactory
            )
            resp.type shouldBe WebDemoController.Type.GOOD_PROGRAM
            (resp.detail as WebDemoController.SuccessResponseDetail).result shouldBe "Value: 42"
        }
        "stack-overflow-program-gets-stack-overflow-program-error" {
            val resp = WebDemoController.interpret(
                programString =
                """
                    class Main {
                        function main(): int = Main::main()
                    }
                """.trimIndent(),
                threadFactory = threadFactory
            )
            println()
            resp.type shouldBe WebDemoController.Type.GOOD_PROGRAM
            (resp.detail as WebDemoController.SuccessResponseDetail).result shouldBe "Panic: StackOverflowException"
        }
        "slow-program-gets-tle-error" {
            val resp = WebDemoController.interpret(
                programString =
                """
                    class Main {
                        function fib(n: int): int =
                          if n == 0 then 0
                          else if n == 1 then 1
                          else Main::fib(n - 2) + Main::fib(n - 1)

                        function main(): int = Main::fib(300)
                    }
                """.trimIndent(),
                threadFactory = threadFactory
            )
            println()
            resp.type shouldBe WebDemoController.Type.GOOD_PROGRAM
            (resp.detail as WebDemoController.SuccessResponseDetail).result shouldBe "Panic: TimeLimitExceeded (1s)"
        }
        "bad-syntax-program-gets-rejected" {
            val resp = WebDemoController.interpret(programString = "lol", threadFactory = threadFactory)
            resp.type shouldBe WebDemoController.Type.BAD_SYNTAX
        }
        "bad-type-program-gets-rejected" {
            val resp = WebDemoController.interpret(
                """
                class Main {
                    function main(): int = "Ah!"
                }
            """.trimIndent(),
                threadFactory = threadFactory
            )
            resp.type shouldBe WebDemoController.Type.BAD_TYPE
        }
    }
}
