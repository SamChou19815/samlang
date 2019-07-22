package samlang.cli

import com.github.ajalt.clikt.core.CliktCommand
import com.github.ajalt.clikt.parameters.options.default
import com.github.ajalt.clikt.parameters.options.option

class TypeCheckCommand : CliktCommand(name = "check") {
    private val sourceDirectory: String by option(
        "-s", "--source-directory",
        help = "Source directory to type check, default to the current working directory."
    ).default(value = ".")

    override fun run() {
        println("Checking: $sourceDirectory")
    }
}
