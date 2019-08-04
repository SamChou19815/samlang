package samlang.cli

import com.github.ajalt.clikt.core.CliktCommand
import com.github.ajalt.clikt.core.requireObject
import java.io.File
import kotlin.system.exitProcess

class CompileCommand : CliktCommand(name = "compile") {
    private val configuration: Configuration by requireObject()

    override fun run() {
        val sourceDirectory = File(configuration.sourceDirectory).absoluteFile
        if (!sourceDirectory.isDirectory) {
            echo(message = "$sourceDirectory is not a directory.", err = true)
            exitProcess(1)
        }
        echo(message = "Compiling sources in $sourceDirectory...", err = true)
    }
}
