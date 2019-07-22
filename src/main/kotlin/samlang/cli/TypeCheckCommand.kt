package samlang.cli

import com.github.ajalt.clikt.core.CliktCommand
import com.github.ajalt.clikt.parameters.options.default
import com.github.ajalt.clikt.parameters.options.option
import samlang.ast.ModuleReference
import java.io.File
import kotlin.system.exitProcess

class TypeCheckCommand : CliktCommand(name = "check") {
    private val sourceDirectory: String by option(
        "-s", "--source-directory",
        help = "Source directory to type check, default to the current working directory."
    ).default(value = ".")

    override fun run() {
        val sourceDirectory = File(sourceDirectory).absoluteFile
        println("Checking: $sourceDirectory")
        if (!sourceDirectory.isDirectory) {
            println("DDD")
            System.err.println("$sourceDirectory is not a directory.")
            exitProcess(1)
        }
        val sourcePath = sourceDirectory.toPath()
        sourceDirectory.walk().forEach { file ->
            if (file.isDirectory) {
                return@forEach
            }
            if (file.extension != "sam") {
                return@forEach
            }
            val relativeFile = sourcePath.relativize(file.toPath()).toFile()
            val moduleReference = ModuleReference(parts = relativeFile.nameWithoutExtension.split("/").toList())
            println("We will type check $moduleReference.")
        }
    }
}
