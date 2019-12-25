package samlang.cli

import com.github.ajalt.clikt.core.CliktCommand
import kotlin.system.exitProcess
import org.eclipse.lsp4j.launch.LSPLauncher
import samlang.Configuration
import samlang.lsp.LanguageServer

class LspCommand : CliktCommand(name = "lsp") {
    override fun run() {
        val configuration = try {
            Configuration.parse()
        } catch (exception: Configuration.IllFormattedConfigurationException) {
            echo(message = exception.reason, err = true)
            exitProcess(status = 1)
        }
        val server = LanguageServer(configuration = configuration)
        val launcher = LSPLauncher.createServerLauncher(server, System.`in`, System.out)
        val client = launcher.remoteProxy
        server.connect(client)
        launcher.startListening().get()
    }
}
