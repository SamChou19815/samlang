package samlang.printer

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.common.getTypeCheckedModule
import samlang.programs.testPrograms

class PrettyPrinterTest : StringSpec() {

    private val programs: List<Pair<String, String>> = testPrograms
        .filter { it.errorSet.isEmpty() }
        .map { (id, _, code) ->
            id to code
        }

    init {
        for ((id, code) in programs) {
            "should consistently print values: $id" {
                val prettyCode1 = prettyPrint(module = getTypeCheckedModule(code = code))
                try {
                    val prettyCode2 = prettyPrint(module = getTypeCheckedModule(code = prettyCode1))
                    prettyCode1 shouldBe prettyCode2
                    println(prettyCode2)
                } catch (e: RuntimeException) {
                    println(prettyCode1)
                    throw e
                }
            }
        }
    }
}
