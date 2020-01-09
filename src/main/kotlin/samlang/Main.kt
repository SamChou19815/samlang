package samlang

import com.github.ajalt.clikt.core.subcommands
import samlang.cli.CompileCommand
import samlang.cli.LspCommand
import samlang.cli.RootCommand
import samlang.cli.ServerCommand
import samlang.cli.TypeCheckCommand

/** Entry point of samlang language service. */
object Main {
    @JvmStatic
    fun main(args: Array<String>): Unit =
        RootCommand().subcommands(TypeCheckCommand(), CompileCommand(), ServerCommand(), LspCommand()).main(args)
}
