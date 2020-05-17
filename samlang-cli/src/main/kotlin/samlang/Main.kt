@file:JvmName(name = "Main")

package samlang

import com.github.ajalt.clikt.core.CliktCommand
import com.github.ajalt.clikt.core.NoRunCliktCommand
import com.github.ajalt.clikt.core.subcommands
import java.io.File
import java.nio.file.Paths
import kotlin.system.exitProcess
import org.eclipse.lsp4j.launch.LSPLauncher
import samlang.ast.common.ModuleReference
import samlang.lsp.LanguageServer
import samlang.optimization.IrCompilationUnitOptimizer
import samlang.optimization.MidIrStatementOptimizer
import samlang.service.checkSources

@ExperimentalStdlibApi
fun main(args: Array<String>): Unit =
    RootCommand().subcommands(CompileCommand(), LspCommand()).main(args)

private class RootCommand : NoRunCliktCommand(name = "samlang")

@ExperimentalStdlibApi
private class CompileCommand : CliktCommand(name = "compile") {
    override fun run() {
        val configuration = try {
            Configuration.parse()
        } catch (exception: Configuration.IllFormattedConfigurationException) {
            echo(message = exception.reason, err = true)
            exitProcess(status = 1)
        }
        val sourceDirectory = File(configuration.sourceDirectory).absoluteFile
        if (!sourceDirectory.isDirectory) {
            echo(message = "$sourceDirectory is not a directory.", err = true)
            exitProcess(status = 1)
        }
        val outputDirectory = File(configuration.outputDirectory).absoluteFile
        if (outputDirectory.exists() && !outputDirectory.isDirectory) {
            echo(message = "$outputDirectory is not a directory.", err = true)
            exitProcess(status = 1)
        }
        echo(message = "Compiling sources in `${configuration.sourceDirectory}` ...", err = true)
        val sourceHandles = collectSources(configuration = configuration)
        val (checkedSources, compileTimeErrors) = checkSources(sourceHandles = sourceHandles)
        if (compileTimeErrors.isNotEmpty()) {
            echo(message = "Found ${compileTimeErrors.size} error(s).", err = true)
            compileTimeErrors.forEach { echo(message = it.errorMessage) }
            return
        }
        compileToX86Assembly(
            source = checkedSources,
            entryModuleReference = ModuleReference.ROOT, // TODO
            optimizer = IrCompilationUnitOptimizer(
                statementOptimizer = MidIrStatementOptimizer.allEnabled,
                doesPerformInlining = true
            ),
            outputDirectory = Paths.get(outputDirectory.toString(), "x86").toFile()
        )
        val noLinkError = compileToX86Executable(
            source = checkedSources,
            optimizer = IrCompilationUnitOptimizer(
                statementOptimizer = MidIrStatementOptimizer.allEnabled,
                doesPerformInlining = true
            ),
            outputDirectory = Paths.get(outputDirectory.toString(), "x86").toFile()
        )
        if (!noLinkError) {
            echo(message = "Compiled output has link errors.", err = true)
            exitProcess(status = 1)
        }
    }
}

private class LspCommand : CliktCommand(name = "lsp") {
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
