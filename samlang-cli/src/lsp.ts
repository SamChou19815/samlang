import { ModuleReference } from '@dev-sam/samlang-core/ast/common-nodes';
import createSamlangLanguageService from '@dev-sam/samlang-core/services';
import { join, relative, resolve, sep } from 'path';
import {
  createConnection,
  DiagnosticSeverity,
  InitializeResult,
  Range,
  ResponseError,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';
import { collectSources, getConfiguration } from './utils';

const ENTIRE_DOCUMENT_RANGE: Range = {
  start: { line: 0, character: 0 },
  end: { line: Number.MAX_SAFE_INTEGER, character: Number.MAX_SAFE_INTEGER },
};

const samlangRangeToLspFoldingRange = (range: Range) => ({
  startLine: range.start.line,
  startCharacter: range.start.character,
  endLine: range.end.line,
  endCharacter: range.end.character,
});

function startSamlangLanguageServer() {
  const configuration = getConfiguration();
  const collectedSources = collectSources(configuration, (parts) => new ModuleReference(parts));
  const service = createSamlangLanguageService(collectedSources);

  function uriToModuleReference(uri: string): ModuleReference {
    const relativePath = relative(
      configuration.sourceDirectory,
      uri.startsWith('file://') ? uri.substring('file://'.length) : uri
    );
    return new ModuleReference(relativePath.substring(0, relativePath.length - 4).split(sep));
  }

  const moduleReferenceToUri = (moduleReference: ModuleReference): string =>
    resolve(join(configuration.sourceDirectory, moduleReference.toFilename()));

  // Create a connection for the server. The connection uses Node's IPC as a transport.
  const connection = createConnection();

  function publishDiagnostics(affectedModules: readonly ModuleReference[]): void {
    affectedModules.forEach((affectedModule) => {
      connection.sendDiagnostics({
        uri: moduleReferenceToUri(affectedModule),
        diagnostics: service.state.getErrors(affectedModule).map((error) => ({
          range: error.range,
          severity: DiagnosticSeverity.Error,
          message: error.toString(),
          source: 'samlang',
        })),
      });
    });
  }

  connection.onInitialize((): InitializeResult => {
    connection.console.info('[lsp] onInitialize');
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Full,
        hoverProvider: true,
        definitionProvider: {},
        foldingRangeProvider: true,
        completionProvider: { triggerCharacters: ['.'], resolveProvider: false },
        renameProvider: true,
        documentFormattingProvider: {},
      },
    };
  });

  connection.onInitialized(() => {
    connection.console.info('[lsp] onInitialized');
    publishDiagnostics(service.state.allModulesWithError);
  });

  connection.onDidChangeTextDocument((parameters) => {
    connection.console.info('[lsp] onDidChangeTextDocument');
    const moduleReference = uriToModuleReference(parameters.textDocument.uri);
    const sourceCode = parameters.contentChanges[0]?.text;
    if (sourceCode == null) return;
    publishDiagnostics(service.state.update(moduleReference, sourceCode));
  });

  connection.onHover((parameters) => {
    connection.console.info('[lsp] onHover');
    return service.queryForHover(
      uriToModuleReference(parameters.textDocument.uri),
      parameters.position
    );
  });

  connection.onDefinition((parameters) => {
    connection.console.info('[lsp] onDefinition');
    const location = service.queryDefinitionLocation(
      uriToModuleReference(parameters.textDocument.uri),
      parameters.position
    );
    return location == null
      ? null
      : { uri: moduleReferenceToUri(location.moduleReference), range: location.range };
  });

  connection.onFoldingRanges((parameters) => {
    connection.console.info('[lsp] onFoldingRanges');
    const foldingRangeResult = service.queryFoldingRanges(
      uriToModuleReference(parameters.textDocument.uri)
    );
    if (foldingRangeResult == null) return null;
    return foldingRangeResult.map(samlangRangeToLspFoldingRange);
  });

  connection.onCompletion((parameters) => {
    connection.console.info('[lsp] onCompletion');
    return service.autoComplete(
      uriToModuleReference(parameters.textDocument.uri),
      parameters.position
    );
  });

  connection.onRenameRequest((parameters) => {
    connection.console.info('[lsp] onRenameRequest');
    const result = service.renameVariable(
      uriToModuleReference(parameters.textDocument.uri),
      parameters.position,
      parameters.newName
    );
    if (result == null) return null;
    if (result === 'Invalid') return new ResponseError(1, 'Invalid identifier.');
    return {
      documentChanges: [
        {
          textDocument: { uri: parameters.textDocument.uri, version: null },
          edits: [{ range: ENTIRE_DOCUMENT_RANGE, newText: result }],
        },
      ],
    };
  });

  connection.onDocumentFormatting((parameters) => {
    connection.console.info('[lsp] onDocumentFormatting');
    const formattedString = service.formatEntireDocument(
      uriToModuleReference(parameters.textDocument.uri)
    );
    if (formattedString == null) return null;
    return [{ range: ENTIRE_DOCUMENT_RANGE, newText: formattedString }];
  });

  connection.listen();
  // eslint-disable-next-line no-console
  console.error('samlang language service listening...');
}

startSamlangLanguageServer();
