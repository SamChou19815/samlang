package samlang.cli

import com.github.ajalt.clikt.core.CliktCommand
import com.github.ajalt.clikt.parameters.options.default
import com.github.ajalt.clikt.parameters.options.option
import samlang.ast.ModuleReference
import samlang.errors.CompilationFailedException
import samlang.frontend.processSources
import java.io.File
import java.io.InputStream
import kotlin.system.exitProcess

class TypeCheckCommand : CliktCommand(name = "check") {
    private val sourceDirectory: String by option(
        "-s", "--source-directory",
        help = "Source directory to type check, default to the current working directory."
    ).default(value = ".")

    override fun run() {
        val sourceDirectory = File(sourceDirectory).absoluteFile
        if (!sourceDirectory.isDirectory) {
            System.err.println("$sourceDirectory is not a directory.")
            exitProcess(1)
        }
        val sourcePath = sourceDirectory.toPath()
        val sourceHandles = arrayListOf<Pair<ModuleReference, InputStream>>()
        sourceDirectory.walk().forEach { file ->
            if (file.isDirectory) {
                return@forEach
            }
            if (file.extension != "sam") {
                return@forEach
            }
            val relativeFile = sourcePath.relativize(file.toPath()).toFile()
            val moduleReference = ModuleReference(parts = relativeFile.nameWithoutExtension.split("/").toList())
            sourceHandles.add(element = moduleReference to file.inputStream())
        }
        try {
            processSources(sourceHandles = sourceHandles)
        } catch (compilationFailedException: CompilationFailedException) {
            println(compilationFailedException.errorMessage)
        }
    }
}
