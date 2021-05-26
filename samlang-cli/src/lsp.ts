import { join, relative, resolve, sep } from 'path';

import {
  createConnection,
  ProposedFeatures,
  InitializeResult,
  TextDocumentSyncKind,
  InsertTextFormat,
  DiagnosticSeverity,
  Range as LspRange,
  FoldingRange as LspFoldingRange,
  TextEdit,
  ResponseError,
} from 'vscode-languageserver/node';

import { collectSources } from './cli-service';
import type { SamlangProjectConfiguration } from './configuration';

import { Position, Range, ModuleReference } from 'samlang-core-ast/common-nodes';
import { prettyPrintSamlangModule } from 'samlang-core-printer';
import { LanguageServiceState, LanguageServices } from 'samlang-core-services';

const ENTIRE_DOCUMENT_RANGE = new Range(
  new Position(0, 0),
  new Position(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
);

const samlangRangeToLspRange = (range: Range): LspRange => ({
  start: { line: range.start.line, character: range.start.column },
  end: { line: range.end.line, character: range.end.column },
});

const samlangRangeToLspFoldingRange = (range: Range): LspFoldingRange => ({
  startLine: range.start.line,
  startCharacter: range.start.column,
  endLine: range.end.line,
  endCharacter: range.end.column,
});

const startSamlangLanguageServer = (configuration: SamlangProjectConfiguration): void => {
  const state = new LanguageServiceState(collectSources(configuration));
  const service = new LanguageServices(state, (samlangModule) =>
    prettyPrintSamlangModule(100, samlangModule)
  );

  const uriToModuleReference = (uri: string): ModuleReference => {
    const relativePath = relative(
      configuration.sourceDirectory,
      uri.startsWith('file://') ? uri.substring('file://'.length) : uri
    );
    return new ModuleReference(relativePath.substring(0, relativePath.length - 4).split(sep));
  };

  const moduleReferenceToUri = (moduleReference: ModuleReference): string =>
    resolve(join(configuration.sourceDirectory, moduleReference.toFilename()));

  // Create a connection for the server. The connection uses Node's IPC as a transport.
  // Also include all preview / proposed LSP features.
  const connection = createConnection(ProposedFeatures.all);

  const publishDiagnostics = (affectedModules: readonly ModuleReference[]): void =>
    affectedModules.forEach((affectedModule) => {
      connection.sendDiagnostics({
        uri: moduleReferenceToUri(affectedModule),
        diagnostics: state.getErrors(affectedModule).map((error) => ({
          range: samlangRangeToLspRange(error.range),
          severity: DiagnosticSeverity.Error,
          message: error.toString(),
          source: 'samlang',
        })),
      });
    });

  connection.onInitialize((): InitializeResult => {
    publishDiagnostics(state.allModulesWithError);
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Full,
        hoverProvider: true,
        definitionProvider: {},
        foldingRangeProvider: true,
        completionProvider: {
          triggerCharacters: ['.'],
          resolveProvider: false,
        },
        renameProvider: true,
        documentFormattingProvider: {},
      },
    };
  });

  connection.onDidChangeTextDocument((didChangeTextDocumentParameters) => {
    const moduleReference = uriToModuleReference(didChangeTextDocumentParameters.textDocument.uri);
    const sourceCode = didChangeTextDocumentParameters.contentChanges[0]?.text;
    if (sourceCode == null) return;
    const affected = state.update(moduleReference, sourceCode);
    publishDiagnostics(affected);
  });

  connection.onHover((hoverParameters) => {
    const moduleReference = uriToModuleReference(hoverParameters.textDocument.uri);
    const lspPosition = hoverParameters.position;
    const samlangPosition = new Position(lspPosition.line, lspPosition.character);
    const hoverResult = service.queryForHover(moduleReference, samlangPosition);
    if (hoverResult == null) return null;
    const [contents, range] = hoverResult;
    return { contents, range: samlangRangeToLspRange(range) };
  });

  connection.onDefinition((gotoDefinitionParameters) => {
    const moduleReference = uriToModuleReference(gotoDefinitionParameters.textDocument.uri);
    const lspPosition = gotoDefinitionParameters.position;
    const samlangPosition = new Position(lspPosition.line, lspPosition.character);
    const location = service.queryDefinitionLocation(moduleReference, samlangPosition);
    return location == null
      ? null
      : {
          uri: moduleReferenceToUri(location.moduleReference),
          range: samlangRangeToLspRange(location.range),
        };
  });

  connection.onFoldingRanges((foldingrangeParameters) => {
    const moduleReference = uriToModuleReference(foldingrangeParameters.textDocument.uri);
    if (moduleReference == null) return null;
    const foldingRangeResult = service.queryFoldingRanges(moduleReference);
    if (foldingRangeResult == null) return null;
    return foldingRangeResult.map((foldingRange) => samlangRangeToLspFoldingRange(foldingRange));
  });

  connection.onCompletion((completionParameters) => {
    const moduleReference = uriToModuleReference(completionParameters.textDocument.uri);
    const lspPosition = completionParameters.position;
    const samlangPosition = new Position(lspPosition.line, lspPosition.character);
    const completionItems = service.autoComplete(moduleReference, samlangPosition);
    return completionItems.map((item) => ({
      kind: item.kind,
      label: item.name,
      detail: item.type,
      insertText: item.text,
      insertTextFormat: item.isSnippet ? InsertTextFormat.Snippet : InsertTextFormat.PlainText,
    }));
  });

  connection.onRenameRequest((renameParameters) => {
    const moduleReference = uriToModuleReference(renameParameters.textDocument.uri);
    const lspPosition = renameParameters.position;
    const samlangPosition = new Position(lspPosition.line, lspPosition.character);
    const result = service.renameVariable(
      moduleReference,
      samlangPosition,
      renameParameters.newName
    );
    if (result == null) return null;
    if (result === 'Invalid') return new ResponseError(1, 'Invalid identifier.');
    return {
      documentChanges: [
        {
          textDocument: { uri: renameParameters.textDocument.uri, version: null },
          edits: [TextEdit.replace(samlangRangeToLspRange(ENTIRE_DOCUMENT_RANGE), result)],
        },
      ],
    };
  });

  connection.onDocumentFormatting((formatParameters) => {
    const moduleReference = uriToModuleReference(formatParameters.textDocument.uri);
    if (moduleReference == null) return null;
    const formattedString = service.formatEntireDocument(moduleReference);
    if (formattedString == null) return null;
    return [TextEdit.replace(samlangRangeToLspRange(ENTIRE_DOCUMENT_RANGE), formattedString)];
  });

  connection.listen();
};

export default startSamlangLanguageServer;
