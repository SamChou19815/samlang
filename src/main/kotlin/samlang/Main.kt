package samlang

import com.github.ajalt.clikt.core.subcommands

/** Entry point of samlang language service. */
object Main {
    @JvmStatic
    fun main(args: Array<String>): Unit =
        RootCommand().subcommands(CompileCommand(), ServerCommand(), LspCommand()).main(args)
}
