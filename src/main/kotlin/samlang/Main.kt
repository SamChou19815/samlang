package samlang

import com.github.ajalt.clikt.core.subcommands
import samlang.cli.CompileCommand
import samlang.cli.LspCommand
import samlang.cli.RootCommand
import samlang.cli.ServerCommand

/** Entry point of samlang language service. */
object Main {
    @JvmStatic
    fun main(args: Array<String>): Unit =
        RootCommand().subcommands(CompileCommand(), ServerCommand(), LspCommand()).main(args)
}
