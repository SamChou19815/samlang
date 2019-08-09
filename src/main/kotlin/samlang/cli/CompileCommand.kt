package samlang.cli

import com.github.ajalt.clikt.core.CliktCommand
import com.github.ajalt.clikt.core.requireObject
import com.github.ajalt.clikt.parameters.options.default
import com.github.ajalt.clikt.parameters.options.option
import com.github.ajalt.clikt.parameters.types.choice
import samlang.errors.CompilationFailedException
import samlang.frontend.collectSourceHandles
import samlang.frontend.compileTsSources
import samlang.frontend.typeCheckSources
import java.io.File
import kotlin.system.exitProcess

class CompileCommand : CliktCommand(name = "compile") {
    private val out: String by option(
        "-o", "--output-directory",
        help = "Output directory of compilation result, default to ./out."
    ).default(value = "./out")
    private val target: String by option("-t", "--target", help = "Compilation target")
        .choice("ts", "js")
        .default(value = "ts")

    private val configuration: Configuration by requireObject()

    override fun run() {
        val sourceDirectory = File(configuration.sourceDirectory).absoluteFile
        if (!sourceDirectory.isDirectory) {
            echo(message = "$sourceDirectory is not a directory.", err = true)
            exitProcess(1)
        }
        val outputDirectory = File(out).absoluteFile
        if (outputDirectory.exists() && !outputDirectory.isDirectory) {
            echo(message = "$outputDirectory is not a directory.", err = true)
            exitProcess(1)
        }
        echo(message = "Compiling sources in $sourceDirectory...", err = true)
        val sourceHandles = collectSourceHandles(sourceDirectory = sourceDirectory)
        val checkedSources = try {
            typeCheckSources(sourceHandles = sourceHandles)
        } catch (compilationFailedException: CompilationFailedException) {
            val errors = compilationFailedException.errors
            echo(message = "Found ${errors.size} error(s).", err = true)
            errors.forEach { echo(message = it.errorMessage) }
            return
        }
        compileTsSources(source = checkedSources, outputDirectory = outputDirectory, withType = target == "ts")
    }
}
