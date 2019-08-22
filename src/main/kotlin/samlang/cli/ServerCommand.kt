package samlang.cli

import com.github.ajalt.clikt.core.CliktCommand
import samlang.server.startServer

class ServerCommand : CliktCommand(name = "server") {
    override fun run(): Unit = startServer()
}
