package samlang.lsp

import java.io.File
import java.util.concurrent.CompletableFuture
import org.eclipse.lsp4j.CompletionItem
import org.eclipse.lsp4j.CompletionList
import org.eclipse.lsp4j.CompletionOptions
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
import org.eclipse.lsp4j.MarkedString
import org.eclipse.lsp4j.Position as Lsp4jPosition
import org.eclipse.lsp4j.Range as Lsp4jRange
import org.eclipse.lsp4j.ServerCapabilities
import org.eclipse.lsp4j.TextDocumentPositionParams
import org.eclipse.lsp4j.TextDocumentSyncKind
import org.eclipse.lsp4j.TextDocumentSyncOptions
import org.eclipse.lsp4j.jsonrpc.messages.Either
import org.eclipse.lsp4j.services.LanguageClient
import org.eclipse.lsp4j.services.LanguageClientAware
import org.eclipse.lsp4j.services.LanguageServer as Lsp4jLanguageServer
import org.eclipse.lsp4j.services.TextDocumentService as Lsp4jTextDocumentService
import org.eclipse.lsp4j.services.WorkspaceService as Lsp4jWorkspaceService
import samlang.Configuration
import samlang.ast.common.ModuleReference
import samlang.ast.common.Position
import samlang.ast.common.Range

class LanguageServer(configuration: Configuration) : Lsp4jLanguageServer, LanguageClientAware {
    private val state: LanguageServerState = LanguageServerState(configuration = configuration)
    private val textDocumentService: TextDocumentService = TextDocumentService()
    private val workspaceService: WorkspaceService = WorkspaceService()

    private lateinit var client: LanguageClient

    override fun connect(client: LanguageClient) {
        this.client = client
    }

    override fun initialize(params: InitializeParams): CompletableFuture<InitializeResult> {
        val serverCapabilities = ServerCapabilities().apply {
            textDocumentSync = Either.forRight(TextDocumentSyncOptions().apply { change = TextDocumentSyncKind.Full })
            hoverProvider = true
            completionProvider = CompletionOptions(false, listOf("."))
            signatureHelpProvider = null
            definitionProvider = false
            referencesProvider = false
            documentHighlightProvider = false
            documentSymbolProvider = false
            workspaceSymbolProvider = false
            codeActionProvider = null
            codeLensProvider = null
            documentFormattingProvider = false
            documentRangeFormattingProvider = false
            documentOnTypeFormattingProvider = null
            renameProvider = null
            documentLinkProvider = null
            executeCommandProvider = null
            experimental = null
        }
        return CompletableFuture.completedFuture(InitializeResult(serverCapabilities))
    }

    override fun shutdown(): CompletableFuture<Any> = CompletableFuture.completedFuture(Unit)

    override fun exit(): Unit = Unit

    override fun getTextDocumentService(): Lsp4jTextDocumentService = textDocumentService

    override fun getWorkspaceService(): Lsp4jWorkspaceService = workspaceService

    private inner class TextDocumentService : Lsp4jTextDocumentService {
        override fun didOpen(params: DidOpenTextDocumentParams): Unit = Unit

        override fun didSave(params: DidSaveTextDocumentParams): Unit = Unit

        override fun didClose(params: DidCloseTextDocumentParams): Unit = Unit

        override fun didChange(params: DidChangeTextDocumentParams) {
            val moduleReference = uriToModuleReference(uri = params.textDocument.uri) ?: return
            val sourceCode = params.contentChanges[0].text
            state.update(moduleReference = moduleReference, sourceCode = sourceCode)
        }

        override fun completion(
            position: CompletionParams
        ): CompletableFuture<Either<List<CompletionItem>, CompletionList>> {
            return CompletableFuture.completedFuture(Either.forLeft(emptyList()))
        }

        override fun hover(position: TextDocumentPositionParams): CompletableFuture<Hover> {
            val moduleReference = uriToModuleReference(uri = position.textDocument.uri)
                ?: return CompletableFuture.completedFuture(null)
            val samlangPosition = position.position.asPosition()
            val (type, range) = state
                .queryType(moduleReference = moduleReference, position = samlangPosition)
                ?: return CompletableFuture.completedFuture(null)
            val hoverResult = Hover(
                listOf(Either.forRight(MarkedString("SAMLANG", type.toString()))),
                range.asLsp4jRange()
            )
            return CompletableFuture.completedFuture(hoverResult)
        }

        private fun uriToModuleReference(uri: String): ModuleReference? {
            val extensionIndex = uri.lastIndexOf(string = ".sam")
            if (extensionIndex == -1) {
                return null
            }
            val parts = uri.substring(startIndex = 0, endIndex = extensionIndex).split(File.separator)
            return ModuleReference(parts = parts)
        }

        private fun Lsp4jPosition.asPosition(): Position = Position(line = line, column = character)

        private fun Position.asLsp4jPosition(): Lsp4jPosition = Lsp4jPosition(line, column)

        private fun Range.asLsp4jRange(): Lsp4jRange = Lsp4jRange(start.asLsp4jPosition(), end.asLsp4jPosition())
    }

    private inner class WorkspaceService : org.eclipse.lsp4j.services.WorkspaceService {
        override fun didChangeWatchedFiles(params: DidChangeWatchedFilesParams): Unit = Unit

        override fun didChangeConfiguration(params: DidChangeConfigurationParams): Unit = Unit
    }
}
