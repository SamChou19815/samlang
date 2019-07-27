package samlang.cli

import com.github.ajalt.clikt.core.CliktCommand
import com.github.ajalt.clikt.core.requireObject
import samlang.ast.ModuleReference
import samlang.errors.CompilationFailedException
import samlang.frontend.processSources
import java.io.File
import java.io.InputStream
import kotlin.system.exitProcess

class TypeCheckCommand : CliktCommand(name = "check") {

    private val configuration: Configuration by requireObject()

    override fun run() {
        val sourceDirectory = File(configuration.sourceDirectory).absoluteFile
        if (!sourceDirectory.isDirectory) {
            echo(message = "$sourceDirectory is not a directory.", err = true)
            exitProcess(1)
        }
        echo(message = "Type checking sources in $sourceDirectory...", err = true)
        val sourcePath = sourceDirectory.toPath()
        val sourceHandles = arrayListOf<Pair<ModuleReference, InputStream>>()
        sourceDirectory.walk().forEach { file ->
            if (file.isDirectory || file.extension != "sam") {
                return@forEach
            }
            val relativeFile = sourcePath.relativize(file.toPath()).toFile()
            val moduleReference = ModuleReference(parts = relativeFile.nameWithoutExtension.split("/").toList())
            sourceHandles.add(element = moduleReference to file.inputStream())
        }
        try {
            processSources(sourceHandles = sourceHandles)
            echo(message = "No errors.", err = true)
        } catch (compilationFailedException: CompilationFailedException) {
            val errors = compilationFailedException.errors
            echo(message = "Found ${errors.size} error(s).", err = true)
            errors.forEach { echo(message = it.errorMessage) }
        }
    }
}
