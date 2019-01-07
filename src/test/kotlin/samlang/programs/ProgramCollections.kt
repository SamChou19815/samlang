package samlang.programs

import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.util.*
import java.util.stream.Collectors

object ProgramCollections {

    private fun loadPrograms(): List<TestProgram> {
        val resourceFolder = File("src/test/resources/samlang/programs")
        val programFiles: Array<File> = resourceFolder.listFiles()
        return programFiles.mapNotNull { file ->
            file.takeIf { it.extension == "samlang" }?.let { f ->
                val name = f.nameWithoutExtension
                val nameParts = name.split("-")
                if (nameParts.size != 2) {
                    error(message = "Bad file name: $name.")
                }
                val type = when (val t = nameParts[0]) {
                    "good" -> TestProgramType.GOOD
                    "bad_type" -> TestProgramType.BAD_TYPE
                    "bad_syntax" -> TestProgramType.BAD_SYNTAX
                    else -> error(message = "Bad type: $t.")
                }
                TestProgram(
                    type = type,
                    id = nameParts[1],
                    code = BufferedReader(InputStreamReader(f.inputStream()))
                        .lines().collect(Collectors.joining("\n"))
                )
            }
        }
    }

    val testPrograms: List<TestProgram> = loadPrograms()

}
