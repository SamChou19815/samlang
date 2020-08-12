package samlang.programs

import java.io.File
import java.nio.file.Paths

private const val SUMMARY_LINE_PREFIX = "// ERROR_COUNT: "

private fun File.toTestProgram(): TestProgram {
    val name = this.nameWithoutExtension
    val lines = this.useLines { it.toList() }
    // Find number of errors
    assert(value = lines.isNotEmpty())
    val expectedErrorCount = lines[0].let { summaryLine ->
        assert(value = summaryLine.startsWith(prefix = SUMMARY_LINE_PREFIX))
        summaryLine.substring(startIndex = SUMMARY_LINE_PREFIX.length).trim().toInt()
    }
    // Collect errors
    val errorSet = sortedSetOf<String>()
    for (errorLineIndex in 1..expectedErrorCount) {
        val errorLine = lines[errorLineIndex]
        assert(value = errorLine.startsWith(prefix = "//"))
        errorSet += errorLine.substring(startIndex = 2).trim()
    }
    // Collect real source code.
    val code = lines.joinToString(separator = "\n", postfix = "\n")
    return TestProgram(id = name, errorSet = errorSet, code = code)
}

private fun loadPrograms(type: String): List<TestProgram> {
    val programFiles: Array<File> = Paths.get("..", "test", type).toFile().listFiles()
        ?: error(message = "Test program folder not found.")
    return programFiles.mapNotNull { file -> file.takeIf { it.extension == "sam" }?.toTestProgram() }.sortedBy { it.id }
}

val runnableTestPrograms: List<TestProgram> = loadPrograms(type = "runnable")
val wellTypedTestPrograms: List<TestProgram> = loadPrograms(type = "well-typed") + runnableTestPrograms
