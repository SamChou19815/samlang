package samlang.programs

import java.io.File
import java.nio.file.Paths

private fun loadPrograms(type: String): List<TestProgram> {
    val programFiles: Array<File> = Paths.get("..", "test", type).toFile().listFiles()
        ?: error(message = "Test program folder not found.")
    return programFiles
        .mapNotNull { file -> file.takeIf { it.extension == "sam" } }
        .map { TestProgram(id = it.nameWithoutExtension, code = it.readText()) }
        .sortedBy { it.id }
}

val wellTypedTestPrograms: List<TestProgram> = loadPrograms(type = "well-typed") + loadPrograms(type = "runnable")
