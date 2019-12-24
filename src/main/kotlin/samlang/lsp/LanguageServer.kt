package samlang.lsp

import java.util.concurrent.CompletableFuture
import org.eclipse.lsp4j.InitializeParams
import org.eclipse.lsp4j.InitializeResult
import org.eclipse.lsp4j.services.TextDocumentService
import org.eclipse.lsp4j.services.WorkspaceService

class LanguageServer : org.eclipse.lsp4j.services.LanguageServer {
    override fun shutdown(): CompletableFuture<Any> {
        TODO("NOT_IMPLEMENTED")
    }

    override fun getTextDocumentService(): TextDocumentService {
        TODO("NOT_IMPLEMENTED")
    }

    override fun exit() {
        TODO("NOT_IMPLEMENTED")
    }

    override fun initialize(params: InitializeParams?): CompletableFuture<InitializeResult> {
        TODO("NOT_IMPLEMENTED")
    }

    override fun getWorkspaceService(): WorkspaceService {
        TODO("NOT_IMPLEMENTED")
    }
}
