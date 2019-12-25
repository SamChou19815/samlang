package samlang.lsp

import java.util.concurrent.CompletableFuture
import org.eclipse.lsp4j.CompletionItem
import org.eclipse.lsp4j.CompletionList
import org.eclipse.lsp4j.CompletionParams
import org.eclipse.lsp4j.DidChangeConfigurationParams
import org.eclipse.lsp4j.DidChangeTextDocumentParams
import org.eclipse.lsp4j.DidChangeWatchedFilesParams
import org.eclipse.lsp4j.DidCloseTextDocumentParams
import org.eclipse.lsp4j.DidOpenTextDocumentParams
import org.eclipse.lsp4j.DidSaveTextDocumentParams
import org.eclipse.lsp4j.Hover
import org.eclipse.lsp4j.InitializeParams
import org.eclipse.lsp4j.InitializeResult
import org.eclipse.lsp4j.ServerCapabilities
import org.eclipse.lsp4j.TextDocumentPositionParams
import org.eclipse.lsp4j.jsonrpc.messages.Either
import org.eclipse.lsp4j.services.LanguageServer as Lsp4jLanguageServer
import org.eclipse.lsp4j.services.TextDocumentService as Lsp4jTextDocumentService
import org.eclipse.lsp4j.services.WorkspaceService as Lsp4jWorkspaceService
import samlang.Configuration

class LanguageServer(configuration: Configuration) : Lsp4jLanguageServer {
    private val state: LanguageServerState = LanguageServerState(configuration = configuration)
    private val textDocumentService: TextDocumentService = TextDocumentService()
    private val workspaceService: WorkspaceService = WorkspaceService()

    override fun initialize(params: InitializeParams): CompletableFuture<InitializeResult> {
        val serverCapabilities = ServerCapabilities().apply {
            hoverProvider = true
        }
        return CompletableFuture.completedFuture(InitializeResult(serverCapabilities))
    }

    override fun shutdown(): CompletableFuture<Any> = CompletableFuture.completedFuture(Unit)

    override fun exit() {}

    override fun getTextDocumentService(): Lsp4jTextDocumentService = textDocumentService

    override fun getWorkspaceService(): Lsp4jWorkspaceService = workspaceService

    private inner class TextDocumentService : Lsp4jTextDocumentService {
        override fun didOpen(params: DidOpenTextDocumentParams) {
            TODO("NOT_IMPLEMENTED")
        }

        override fun didSave(params: DidSaveTextDocumentParams) {
            TODO("NOT_IMPLEMENTED")
        }

        override fun didClose(params: DidCloseTextDocumentParams) {
            TODO("NOT_IMPLEMENTED")
        }

        override fun didChange(params: DidChangeTextDocumentParams) {
            TODO("NOT_IMPLEMENTED")
        }

        override fun completion(
            position: CompletionParams
        ): CompletableFuture<Either<List<CompletionItem>, CompletionList>> {
            return CompletableFuture.completedFuture(Either.forLeft(emptyList()))
        }

        override fun hover(position: TextDocumentPositionParams): CompletableFuture<Hover> {
            // TODO: add actual stuff to hover response.
            return CompletableFuture.completedFuture(Hover())
        }
    }

    private inner class WorkspaceService : org.eclipse.lsp4j.services.WorkspaceService {
        override fun didChangeWatchedFiles(params: DidChangeWatchedFilesParams) {
            TODO("NOT_IMPLEMENTED")
        }

        override fun didChangeConfiguration(params: DidChangeConfigurationParams) {
            TODO("NOT_IMPLEMENTED")
        }
    }
}
