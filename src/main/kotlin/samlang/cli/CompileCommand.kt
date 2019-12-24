package samlang.cli

import com.github.ajalt.clikt.core.CliktCommand
import java.io.File
import java.nio.file.Paths
import kotlin.system.exitProcess
import samlang.Configuration
import samlang.errors.CompilationFailedException
import samlang.service.SourceChecker
import samlang.service.SourceCollector
import samlang.service.SourceCompiler

class CompileCommand : CliktCommand(name = "compile") {
    override fun run() {
        val configuration = Configuration.parse()
        val sourceDirectory = File(configuration.sourceDirectory).absoluteFile
        if (!sourceDirectory.isDirectory) {
            echo(message = "$sourceDirectory is not a directory.", err = true)
            exitProcess(1)
        }
        val outputDirectory = File(configuration.outputDirectory).absoluteFile
        if (outputDirectory.exists() && !outputDirectory.isDirectory) {
            echo(message = "$outputDirectory is not a directory.", err = true)
            exitProcess(1)
        }
        echo(message = "Compiling sources in `${configuration.sourceDirectory}` ...", err = true)
        val sourceHandles = SourceCollector.collectHandles(configuration = configuration)
        val checkedSources = try {
            SourceChecker.typeCheck(sourceHandles = sourceHandles)
        } catch (compilationFailedException: CompilationFailedException) {
            val errors = compilationFailedException.errors
            echo(message = "Found ${errors.size} error(s).", err = true)
            errors.forEach { echo(message = it.errorMessage) }
            return
        }
        for (target in configuration.targets) {
            when (target) {
                "ts" -> SourceCompiler.compileTsSources(
                    source = checkedSources,
                    outputDirectory = Paths.get(outputDirectory.toString(), "ts").toFile(),
                    withType = true
                )
                "js" -> SourceCompiler.compileTsSources(
                    source = checkedSources,
                    outputDirectory = Paths.get(outputDirectory.toString(), "js").toFile(),
                    withType = false
                )
                "java" -> SourceCompiler.compileJavaSources(
                    source = checkedSources,
                    outputDirectory = Paths.get(outputDirectory.toString(), "java").toFile()
                )
            }
        }
    }
}
