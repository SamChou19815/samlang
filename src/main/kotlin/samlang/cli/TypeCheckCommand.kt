package samlang.cli

import com.github.ajalt.clikt.core.CliktCommand
import java.io.File
import kotlin.system.exitProcess
import samlang.errors.CompilationFailedException
import samlang.parseConfiguration
import samlang.service.SourceChecker
import samlang.service.SourceCollector

class TypeCheckCommand : CliktCommand(name = "check") {
    override fun run() {
        val configuration = parseConfiguration()
        val sourceDirectory = File(configuration.sourceDirectory).absoluteFile
        if (!sourceDirectory.isDirectory) {
            echo(message = "$sourceDirectory is not a directory.", err = true)
            exitProcess(1)
        }
        echo(message = "Type checking sources in `${configuration.sourceDirectory}` ...", err = true)
        val sourceHandles = SourceCollector.collectHandles(configuration = configuration)
        try {
            SourceChecker.typeCheck(sourceHandles = sourceHandles)
            echo(message = "No errors.", err = true)
        } catch (compilationFailedException: CompilationFailedException) {
            val errors = compilationFailedException.errors
            echo(message = "Found ${errors.size} error(s).", err = true)
            errors.forEach { echo(message = it.errorMessage) }
        }
    }
}
