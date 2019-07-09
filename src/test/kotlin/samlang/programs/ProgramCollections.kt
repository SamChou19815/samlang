package samlang.programs

import java.io.File

private const val SUMMARY_LINE_PREFIX = "// ERROR_COUNT: "

private fun File.toTestProgram(): TestProgram {
    val name = this.nameWithoutExtension
    val nameParts = name.split(".")
    if (nameParts.size != 2) {
        error(message = "Bad file name: $name.")
    }
    val isGood = when (val type = nameParts[0]) {
        "good" -> true
        "bad" -> false
        else -> error(message = "Bad type: $type.")
    }
    val lines = this.useLines { it.toList() }
    // Find number of errors
    assert(value = lines.isNotEmpty())
    val expectedErrorCount = lines[0].let { summaryLine ->
        assert(value = summaryLine.startsWith(prefix = SUMMARY_LINE_PREFIX))
        summaryLine.substring(startIndex = SUMMARY_LINE_PREFIX.length).trim().toInt()
    }
    assert(value = isGood.xor(other = expectedErrorCount > 0))
    // Collect errors
    val errorSet = hashSetOf<String>()
    for (errorLineIndex in 1..expectedErrorCount) {
        val errorLine = lines[errorLineIndex]
        assert(value = errorLine.startsWith(prefix = "//"))
        errorSet.add(element = errorLine.substring(startIndex = 2).trim())
    }
    // Collect real source code.
    val code = lines.joinToString(separator = "\n", postfix = "\n")
    return TestProgram(
        id = nameParts[1],
        errorSet = errorSet,
        code = code
    )
}

private fun loadPrograms(): List<TestProgram> {
    val programFiles: Array<File> = File("src/test/resources/samlang/programs").listFiles()
        ?: error(message = "Test program folder not found.")
    return programFiles.mapNotNull { file -> file.takeIf { it.extension == "samlang" }?.toTestProgram() }
}

val testPrograms: List<TestProgram> = loadPrograms()
