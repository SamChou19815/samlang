@file:JvmName(name = "Main")

package samlang

import com.github.ajalt.clikt.core.subcommands
import samlang.cli.RootCommand
import samlang.cli.TypeCheckCommand

/**
 * Entry point of samlang language service.
 */
fun main(args: Array<String>): Unit = RootCommand().subcommands(TypeCheckCommand()).main(args)
