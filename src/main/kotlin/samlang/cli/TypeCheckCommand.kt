package samlang.cli

import com.github.ajalt.clikt.core.CliktCommand
import com.github.ajalt.clikt.core.requireObject
import samlang.errors.CompilationFailedException
import samlang.frontend.collectSourceHandles
import samlang.frontend.typeCheckSources
import java.io.File
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
        val sourceHandles = collectSourceHandles(sourceDirectory = sourceDirectory)
        try {
            typeCheckSources(sourceHandles = sourceHandles)
            echo(message = "No errors.", err = true)
        } catch (compilationFailedException: CompilationFailedException) {
            val errors = compilationFailedException.errors
            echo(message = "Found ${errors.size} error(s).", err = true)
            errors.forEach { echo(message = it.errorMessage) }
        }
    }
}
