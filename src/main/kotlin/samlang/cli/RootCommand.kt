package samlang.cli

import com.github.ajalt.clikt.core.CliktCommand
import com.github.ajalt.clikt.core.findObject
import com.github.ajalt.clikt.parameters.options.default
import com.github.ajalt.clikt.parameters.options.option

class RootCommand : CliktCommand(name = "sam") {
    private val sourceDirectory: String by option(
        "-s", "--source-directory",
        help = "Source directory to process, default to the current working directory."
    ).default(value = ".")
    private val exclude: String? by option(
        "-e", "--exclude",
        help = "Path pattern (Java regex syntax) to exclude from source directory."
    )

    private val configuration: Configuration by findObject { Configuration() }

    override fun run() {
        configuration.sourceDirectory = sourceDirectory
        configuration.exclude = exclude
    }
}
