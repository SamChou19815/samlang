package samlang.printer

import io.kotlintest.fail
import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.common.ModuleReference
import samlang.ast.lang.Module
import samlang.checker.ErrorCollector
import samlang.checker.typeCheckSingleModuleSource
import samlang.parser.buildModuleFromText
import samlang.programs.wellTypedTestPrograms

class PrettyPrinterTest : StringSpec() {
    private val programs: List<Pair<String, String>> = wellTypedTestPrograms.map { (id, code) -> id to code }

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

    private fun getTypeCheckedModule(code: String): Module {
        val errorCollector = ErrorCollector()
        val module = typeCheckSingleModuleSource(
            module = buildModuleFromText(
                moduleReference = ModuleReference(moduleName = "test"),
                text = code
            ).first,
            errorCollector = errorCollector
        )
        if (errorCollector.collectedErrors.isNotEmpty()) {
            fail(msg = "Detected errors: ${errorCollector.collectedErrors}")
        }
        return module
    }
}
