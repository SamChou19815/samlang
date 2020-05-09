package samlang.lsp

import java.io.File
import java.net.URI
import java.nio.file.Paths
import java.util.concurrent.CompletableFuture
import org.eclipse.lsp4j.CompletionItem
import org.eclipse.lsp4j.CompletionList
import org.eclipse.lsp4j.CompletionOptions
import org.eclipse.lsp4j.CompletionParams
import org.eclipse.lsp4j.Diagnostic
import org.eclipse.lsp4j.DiagnosticSeverity
import org.eclipse.lsp4j.DidChangeConfigurationParams
import org.eclipse.lsp4j.DidChangeTextDocumentParams
import org.eclipse.lsp4j.DidChangeWatchedFilesParams
import org.eclipse.lsp4j.DidCloseTextDocumentParams
import org.eclipse.lsp4j.DidOpenTextDocumentParams
import org.eclipse.lsp4j.DidSaveTextDocumentParams
import org.eclipse.lsp4j.Hover
import org.eclipse.lsp4j.InitializeParams
import org.eclipse.lsp4j.InitializeResult
import org.eclipse.lsp4j.InsertTextFormat
import org.eclipse.lsp4j.MarkedString
import org.eclipse.lsp4j.Position as Lsp4jPosition
import org.eclipse.lsp4j.PublishDiagnosticsParams
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

class LanguageServer(private val configuration: Configuration) : Lsp4jLanguageServer, LanguageClientAware {
    private val state: LanguageServerState = LanguageServerState(configuration = configuration)
    private val service: LanguageServerServices = LanguageServerServices(state = state)

    private val textDocumentService: TextDocumentService = TextDocumentService()
    private val workspaceService: WorkspaceService = WorkspaceService()

    private lateinit var client: LanguageClient

    override fun connect(client: LanguageClient) {
        this.client = client
        System.err.println("Connected to the client.")
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
        publishDiagnostics(affectedModules = state.allModulesWithError)
        return CompletableFuture.completedFuture(InitializeResult(serverCapabilities))
    }

    override fun shutdown(): CompletableFuture<Any> = CompletableFuture.completedFuture(Unit)

    override fun exit(): Unit = Unit

    override fun getTextDocumentService(): Lsp4jTextDocumentService = textDocumentService

    override fun getWorkspaceService(): Lsp4jWorkspaceService = workspaceService

    private fun publishDiagnostics(affectedModules: List<ModuleReference>) {
        val rootUri = Paths.get(configuration.sourceDirectory).toAbsolutePath().toUri()
        for (affectedModule in affectedModules) {
            val parameters = PublishDiagnosticsParams().apply {
                uri = rootUri.resolve(affectedModule.toFilename()).toString()
                diagnostics = state.getErrors(moduleReference = affectedModule).map { error ->
                    Diagnostic(error.range.asLsp4jRange(), error.reason, DiagnosticSeverity.Error, "samlang")
                }
            }
            client.publishDiagnostics(parameters)
        }
    }

    private fun uriToModuleReference(uri: String): ModuleReference {
        val relativeFile = Paths.get(configuration.sourceDirectory)
            .toAbsolutePath()
            .relativize(Paths.get(URI(uri).path))
            .toFile()
        val parts = relativeFile.parent.split(File.separator).toMutableList()
        parts.add(element = relativeFile.nameWithoutExtension)
        return ModuleReference(parts = parts)
    }

    private fun Lsp4jPosition.asPosition(): Position = Position(line = line, column = character)

    private fun Position.asLsp4jPosition(): Lsp4jPosition = Lsp4jPosition(line, column)

    private fun Range.asLsp4jRange(): Lsp4jRange = Lsp4jRange(start.asLsp4jPosition(), end.asLsp4jPosition())

    private inner class TextDocumentService : Lsp4jTextDocumentService {
        override fun didOpen(params: DidOpenTextDocumentParams): Unit = Unit

        override fun didSave(params: DidSaveTextDocumentParams): Unit = Unit

        override fun didClose(params: DidCloseTextDocumentParams): Unit = Unit

        override fun didChange(params: DidChangeTextDocumentParams) {
            val uri = params.textDocument.uri
            System.err.println("Did change: $uri")
            val moduleReference = uriToModuleReference(uri = uri)
            val sourceCode = params.contentChanges[0].text
            val affected = state.update(moduleReference = moduleReference, sourceCode = sourceCode)
            publishDiagnostics(affectedModules = affected)
        }

        override fun completion(
            position: CompletionParams
        ): CompletableFuture<Either<List<CompletionItem>, CompletionList>> {
            val moduleReference = uriToModuleReference(uri = position.textDocument.uri)
            val samlangPosition = position.position.asPosition()
            val triggerCharacter = position.context.triggerCharacter
            System.err.println("Completion request: $triggerCharacter $moduleReference $samlangPosition")
            val completionItems = service
                .autoComplete(moduleReference = moduleReference, position = samlangPosition)
                .map { (itemName, itemText, isSnippet, itemKind, itemType) ->
                    CompletionItem(itemName).apply {
                        detail = itemType
                        kind = itemKind
                        insertText = itemText
                        insertTextFormat = if (isSnippet) InsertTextFormat.Snippet else InsertTextFormat.PlainText
                    }
                }
            return CompletableFuture.completedFuture(Either.forRight(CompletionList(false, completionItems)))
        }

        override fun hover(position: TextDocumentPositionParams): CompletableFuture<Hover> {
            val moduleReference = uriToModuleReference(uri = position.textDocument.uri)
            val samlangPosition = position.position.asPosition()
            System.err.println("Hover request: $moduleReference $samlangPosition")
            val (type, range) = service
                .queryType(moduleReference = moduleReference, position = samlangPosition)
                ?: return CompletableFuture.completedFuture(null)
            val hoverResult = Hover(
                listOf(Either.forRight(MarkedString("samlang", type.toString()))),
                range.asLsp4jRange()
            )
            return CompletableFuture.completedFuture(hoverResult)
        }
    }

    private inner class WorkspaceService : org.eclipse.lsp4j.services.WorkspaceService {
        override fun didChangeWatchedFiles(params: DidChangeWatchedFilesParams): Unit = Unit

        override fun didChangeConfiguration(params: DidChangeConfigurationParams): Unit = Unit
    }
}
