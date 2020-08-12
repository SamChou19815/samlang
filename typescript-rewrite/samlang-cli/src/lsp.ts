import { relative, sep, resolve } from 'path';

import {
  createConnection,
  ProposedFeatures,
  InitializeResult,
  TextDocumentSyncKind,
  InsertTextFormat,
  DiagnosticSeverity,
  Range as LspRange,
} from 'vscode-languageserver';

import { collectSources } from './cli-service';
import { SamlangProjectConfiguration } from './configuration';

import {
  LanguageServiceState,
  LanguageServices,
  Position,
  Range,
  ModuleReference,
  prettyPrintType,
} from '@dev-sam/samlang-core';

const samlangRangeToLspRange = (range: Range): LspRange => ({
  start: { line: range.start.line, character: range.start.column },
  end: { line: range.end.line, character: range.end.column },
});

const startSamlangLanguageServer = (configuration: SamlangProjectConfiguration): void => {
  const state = new LanguageServiceState(collectSources(configuration));
  const service = new LanguageServices(state);

  const uriToModuleReference = (uri: string): ModuleReference => {
    const relativePath = relative(configuration.sourceDirectory, uri);
    return new ModuleReference(relativePath.substring(0, relativePath.length - 4).split(sep));
  };

  // Create a connection for the server. The connection uses Node's IPC as a transport.
  // Also include all preview / proposed LSP features.
  const connection = createConnection(ProposedFeatures.all);

  const publishDiagnostics = (affectedModules: readonly ModuleReference[]): void =>
    affectedModules.forEach((affectedModule) => {
      connection.sendDiagnostics({
        uri: resolve(configuration.sourceDirectory, affectedModule.toFilename()),
        diagnostics: state.getErrors(affectedModule).map((error) => ({
          range: samlangRangeToLspRange(error.range),
          severity: DiagnosticSeverity.Error,
          message: error.toString(),
          source: 'samlang',
        })),
      });
    });

  connection.onInitialize(
    (): InitializeResult => {
      publishDiagnostics(state.allModulesWithError);
      return {
        capabilities: {
          textDocumentSync: TextDocumentSyncKind.Full,
          hoverProvider: true,
          completionProvider: {
            triggerCharacters: ['.'],
            resolveProvider: false,
          },
        },
      };
    }
  );

  connection.onDidChangeTextDocument((didChangeTextDocumentParameters) => {
    const moduleReference = uriToModuleReference(didChangeTextDocumentParameters.textDocument.uri);
    const sourceCode = didChangeTextDocumentParameters.contentChanges[0].text;
    const affected = state.update(moduleReference, sourceCode);
    publishDiagnostics(affected);
  });

  connection.onHover((hoverParameters) => {
    const moduleReference = uriToModuleReference(hoverParameters.textDocument.uri);
    const lspPosition = hoverParameters.position;
    const samlangPosition = new Position(lspPosition.line, lspPosition.character);
    const hoverResult = service.queryType(moduleReference, samlangPosition);
    if (hoverResult == null) return null;
    const [type, range] = hoverResult;
    return {
      contents: { language: 'samlang', value: prettyPrintType(type) },
      range: samlangRangeToLspRange(range),
    };
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

  connection.listen();
};

export default startSamlangLanguageServer;
